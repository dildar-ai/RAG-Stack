import { supabase } from './supabaseClient'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'

/**
 * Retrieves a fresh Supabase access token, refreshing the session when needed.
 * The FastAPI backend validates this token and enforces workspace ownership,
 * so no privileged key ever reaches the browser.
 */
async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new ApiError(401, 'You are signed out. Please log in again.')
  }
  return session.access_token
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Extracts FastAPI's `detail` field from a failed response. */
async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body?.detail === 'string') return body.detail
    if (Array.isArray(body?.detail)) {
      // FastAPI validation errors arrive as objects carrying a `msg` field
      return body.detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join('; ')
    }
    return response.statusText || 'Request failed.'
  } catch {
    return response.statusText || 'Request failed.'
  }
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken()

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new ApiError(
      0,
      'Cannot reach the RAG API server. Make sure the backend is running and reachable.',
    )
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response))
  }
  return response
}

export interface CitationPayload {
  document_id: string
  filename: string
  page: number
  bbox: number[]
  text: string
  pdf_url?: string | null
  // Matches the [n] marker in the answer text (1-based, post-renumber)
  marker?: number | null
}

export interface ChatResult {
  answer: string
  citations: CitationPayload[]
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export async function sendChatMessage(
  workspaceId: string,
  query: string,
  history: ChatTurn[] = [],
): Promise<ChatResult> {
  const response = await apiFetch('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, query, history }),
  })
  return (await response.json()) as ChatResult
}

export async function uploadDocument(workspaceId: string, file: File): Promise<string> {
  const maxMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 25)
  if (file.size > maxMb * 1024 * 1024) {
    throw new ApiError(413, `File is larger than the ${maxMb} MB upload limit.`)
  }

  const formData = new FormData()
  formData.append('file', file)

  const response = await apiFetch(
    `/api/v1/upload?workspace_id=${encodeURIComponent(workspaceId)}`,
    { method: 'POST', body: formData },
  )
  const data = await response.json()
  return data.document_id as string
}

export async function deleteDocument(workspaceId: string, documentId: string): Promise<void> {
  await apiFetch('/api/v1/documents/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, document_id: documentId }),
  })
}

/**
 * Fetches a short-lived signed URL for a stored PDF.
 * Requested on each click so citations restored from old chats still resolve.
 */
export async function getDocumentUrl(
  workspaceId: string,
  documentId: string,
): Promise<{ url: string; filename: string }> {
  const response = await apiFetch('/api/v1/documents/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, document_id: documentId }),
  })
  return response.json()
}
