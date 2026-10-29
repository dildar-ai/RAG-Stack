'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Bot, FileText, Loader2, Send, AlertCircle } from 'lucide-react'
import PdfViewer from '@/components/PdfViewer'
import type { CitationPayload } from '@/lib/apiClient'
import {
  fetchWidgetConfig,
  sendWidgetMessage,
  WidgetError,
  type WidgetConfig,
} from '@/lib/widgetClient'

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: CitationPayload[]
  isError?: boolean
}

const HISTORY_TURNS = 6

/**
 * Public, embeddable assistant surface. Renders inside an <iframe> on the
 * customer's website, so it must stay self-contained and iframe-friendly.
 */
export default function WidgetChat({ publishableKey }: { publishableKey: string }) {
  const [config, setConfig] = useState<WidgetConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeCitation, setActiveCitation] = useState<CitationPayload | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchWidgetConfig(publishableKey)
      .then(cfg => {
        if (cancelled) return
        setConfig(cfg)
      })
      .catch((err: WidgetError) => {
        if (!cancelled) setConfigError(err.message || 'This assistant is unavailable.')
      })
    return () => {
      cancelled = true
    }
  }, [publishableKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, submitting])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const question = input.trim()
    if (!question || submitting) return

    // The greeting is rendered statically, so only real turns become context
    const history = messages
      .filter(m => !m.isError)
      .slice(-HISTORY_TURNS)
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, { role: 'user', content: question }])
    setInput('')
    setSubmitting(true)

    try {
      const result = await sendWidgetMessage(publishableKey, question, history)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: result.answer, citations: result.citations },
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            err instanceof WidgetError && err.status === 429
              ? 'You are sending messages too quickly. Please wait a moment.'
              : err instanceof Error && err.message
                ? err.message
                : 'Something went wrong. Please try again.',
          isError: true,
        },
      ])
    } finally {
      setSubmitting(false)
    }
  }

  if (configError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center text-center px-6 bg-white">
        <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-sm font-bold text-slate-800">Chat assistant unavailable</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">{configError}</p>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Widget header */}
      <header className="shrink-0 px-4 py-3 bg-slate-900 text-white flex items-center space-x-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <Bot className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{config.workspace_name}</p>
          <p className="text-[10px] text-slate-400 font-medium">Powered by RAG Stack</p>
        </div>
      </header>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60">
        {/* Static greeting */}
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-xs px-3.5 py-2.5 text-[13px] leading-relaxed bg-white border border-slate-200 text-slate-800 shadow-xs whitespace-pre-wrap">
            {config.welcome_message}
          </div>
        </div>

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-xs'
                  : msg.isError
                    ? 'bg-red-50 border border-red-200 text-red-700 rounded-bl-xs'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs shadow-xs'
              }`}
            >
              <div className="space-y-2">
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {msg.citations && msg.citations.length > 0 && (
                  <div className="pt-2 mt-1 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {msg.citations.map((cit, cidx) => (
                      <button
                        key={cidx}
                        onClick={() => config.allow_source_access && setActiveCitation(cit)}
                        disabled={!config.allow_source_access}
                        title={cit.text}
                        className={`inline-flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded-lg border transition font-semibold ${
                          config.allow_source_access
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-600 hover:text-white'
                            : 'bg-slate-50 text-slate-500 border-slate-200 cursor-default'
                        }`}
                      >
                        <FileText className="w-3 h-3" />
                        <span>
                          [{cit.marker ?? cidx + 1}] {cit.filename.replace(/\.pdf$/i, '')} · P{cit.page}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {submitting && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-xs px-3.5 py-2.5 flex items-center space-x-2 shadow-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              <span className="text-[11px] font-semibold text-slate-500">Searching your knowledge base...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form onSubmit={handleSubmit} className="shrink-0 p-3 bg-white border-t border-slate-200 flex space-x-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={submitting}
          placeholder="Ask a question..."
          maxLength={2000}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-indigo-500 focus:bg-white transition disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={submitting || !input.trim()}
          className="w-11 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {activeCitation && (
        <PdfViewer
          url={activeCitation.pdf_url ?? ''}
          pageNumber={activeCitation.page}
          bbox={activeCitation.bbox}
          filename={activeCitation.filename}
          onClose={() => setActiveCitation(null)}
        />
      )}
    </div>
  )
}
