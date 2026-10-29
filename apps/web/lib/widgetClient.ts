/**
 * Browser client for the public embeddable chat widget.
 *
 * Unlike the dashboard this runs for anonymous visitors, so it authenticates
 * with the workspace's publishable key instead of a user session.
 */
import type { CitationPayload } from './apiClient'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'

export interface WidgetConfig {
  workspace_name: string
  welcome_message: string
  allow_source_access: boolean
}

export interface WidgetChatResult {
  answer: string
  citations: CitationPayload[]
}

export class WidgetError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'WidgetError'
    this.status = status
  }
}

async function widgetFetch(publishableKey: string, path: string, init: RequestInit) {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        'X-Publishable-Key': publishableKey,
      },
    })
  } catch {
    throw new WidgetError(0, 'The assistant is temporarily unreachable. Please try again later.')
  }

  if (!response.ok) {
    let detail = 'Request failed.'
    try {
      const body = await response.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      /* keep default message */
    }
    throw new WidgetError(response.status, detail)
  }
  return response
}

export async function fetchWidgetConfig(publishableKey: string): Promise<WidgetConfig> {
  const response = await widgetFetch(publishableKey, '/api/v1/widget/config', { method: 'GET' })
  return response.json()
}

export async function sendWidgetMessage(
  publishableKey: string,
  query: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<WidgetChatResult> {
  const response = await widgetFetch(publishableKey, '/api/v1/widget/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, history }),
  })
  return response.json()
}
