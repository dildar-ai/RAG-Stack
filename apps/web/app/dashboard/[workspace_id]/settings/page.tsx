'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  Code,
  Copy,
  CheckCircle2,
  ShieldCheck,
  Eye,
  RefreshCw,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'

interface WidgetSettings {
  workspace_id: string
  publishable_key: string
  is_enabled: boolean
  allow_source_access: boolean
  welcome_message: string
  allowed_origins: string[]
}

const DEFAULT_WELCOME = 'Ask me anything about our documents.'

function generatePublishableKey(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  return `pk_live_${random}`.toLowerCase()
}

export default function DeployWidgetPage() {
  const params = useParams()
  const workspace_id = params.workspace_id as string

  const [settings, setSettings] = useState<WidgetSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [originsDraft, setOriginsDraft] = useState('')

  // Host origin is only known client-side; needed to build the iframe snippet
  const hostOrigin = useMemo(
    () => (typeof window === 'undefined' ? 'https://your-app.vercel.app' : window.location.origin),
    [],
  )

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('widget_settings')
      .select('*')
      .eq('workspace_id', workspace_id)
      .maybeSingle()

    if (error) {
      setFeedback({ kind: 'error', text: error.message })
    } else if (data) {
      const loaded = data as WidgetSettings
      setSettings(loaded)
      setOriginsDraft((loaded.allowed_origins ?? []).join('\n'))
    }
    setLoading(false)
  }, [workspace_id])

  useEffect(() => {
    load()
  }, [load])

  /** Creates the workspace row lazily, the first time the widget is enabled. */
  const persist = async (patch: Partial<WidgetSettings>) => {
    setSaving(true)
    setFeedback(null)

    const nextKey = settings?.publishable_key ?? generatePublishableKey()
    const payload: WidgetSettings = {
      workspace_id,
      publishable_key: nextKey,
      is_enabled: settings?.is_enabled ?? false,
      allow_source_access: settings?.allow_source_access ?? false,
      welcome_message: settings?.welcome_message ?? DEFAULT_WELCOME,
      allowed_origins: settings?.allowed_origins ?? [],
      ...patch,
    }

    const { data, error } = await supabase
      .from('widget_settings')
      .upsert(payload, { onConflict: 'workspace_id' })
      .select()
      .single()

    if (error) {
      setFeedback({ kind: 'error', text: error.message })
    } else {
      setSettings(data as WidgetSettings)
      setOriginsDraft((data as WidgetSettings).allowed_origins.join('\n'))
    }

    setSaving(false)
    return !error
  }

  const origins = originsDraft
    .split('\n')
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(Boolean)

  const snippet = `<iframe
  src="${hostOrigin}/widget/${settings?.publishable_key ?? 'YOUR_PUBLISHABLE_KEY'}"
  width="380"
  height="600"
  style="border:0; border-radius:16px; box-shadow:0 12px 32px rgba(15,23,42,.16);"
  title="Document Assistant"
  loading="lazy"
  referrerpolicy="no-referrer"
></iframe>`

  const copySnippet = async () => {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 font-sans">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Deploy Chatbot Widget</h1>
        <p className="text-slate-500 text-xs font-medium mt-1">
          Embed the assistant on your website in under a minute. Visitors ask questions against this
          workspace&apos;s knowledge base without needing an account.
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-start space-x-2 rounded-xl border px-4 py-3 text-xs font-semibold ${
            feedback.kind === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-6">
          {/* Access control */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Widget Availability</h2>
                <p className="text-slate-500 text-xs font-medium mt-0.5">
                  Published widgets are reachable by anyone who loads the embed.
                </p>
              </div>
              <Toggle
                checked={settings?.is_enabled ?? false}
                disabled={saving}
                onChange={enabled => persist({ is_enabled: enabled })}
                label="Enable public widget"
              />
            </div>

            <div className="pt-1 space-y-4 border-t border-slate-100">
              <label className="block">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Welcome Message
                </span>
                <textarea
                  value={settings?.welcome_message ?? DEFAULT_WELCOME}
                  rows={2}
                  maxLength={300}
                  disabled={saving}
                  onChange={e =>
                    setSettings(prev => (prev ? { ...prev, welcome_message: e.target.value } : prev))
                  }
                  className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none focus:border-indigo-600 focus:bg-white transition"
                />
              </label>

              <div className="flex justify-end">
                <button
                  onClick={() => persist({ welcome_message: settings?.welcome_message ?? DEFAULT_WELCOME })}
                  disabled={saving}
                  className="text-xs font-bold text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 transition disabled:opacity-50"
                >
                  Save Message
                </button>
              </div>
            </div>
          </div>

          {/* Embed code */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 border border-indigo-100">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Embed Snippet</h2>
              <p className="text-slate-500 text-xs font-medium mt-1 leading-relaxed">
                Paste this before the closing <code>&lt;/body&gt;</code> tag of your website. The widget
                loads in an isolated iframe, so your page scripts and styles stay separate.
              </p>
            </div>

            <div className="relative">
              <pre className="bg-slate-900 rounded-xl p-4 border border-slate-800 overflow-x-auto">
                <code className="text-emerald-400 text-[11px] font-mono whitespace-pre">{snippet}</code>
              </pre>
              <button
                onClick={copySnippet}
                disabled={!settings?.is_enabled}
                className="absolute top-3 right-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white p-2 rounded-lg transition"
                title={settings?.is_enabled ? 'Copy embed snippet' : 'Enable the widget first'}
              >
                {copied ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-300" />
                )}
              </button>
            </div>

            {settings?.is_enabled && (
              <a
                href={`/widget/${settings.publishable_key}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Preview the live widget</span>
              </a>
            )}
          </div>
        </div>

        {/* Sidebar: credentials & restrictions */}
        <div className="w-full lg:w-80 shrink-0 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center">
              <ShieldCheck className="w-4 h-4 mr-2 text-indigo-600" />
              Publishable Key
            </h3>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              Grants read-only Q&amp;A access to this workspace. It cannot upload, delete or list documents.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <code className="text-[11px] font-mono text-slate-700 break-all">
                {settings?.publishable_key ?? 'Not generated yet'}
              </code>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => persist({})}
                disabled={saving || !!settings}
                className="flex-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-3 py-2 rounded-lg transition"
              >
                Generate Key
              </button>
              {settings && (
                <button
                  onClick={() => persist({ publishable_key: generatePublishableKey() })}
                  disabled={saving}
                  className="flex items-center justify-center w-9 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg transition disabled:opacity-40"
                  title="Rotate key"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center">
              <Eye className="w-4 h-4 mr-2 text-indigo-600" />
              Restrictions
            </h3>

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700">Allow source PDF downloads</span>
              <Toggle
                checked={settings?.allow_source_access ?? false}
                disabled={saving}
                onChange={value => persist({ allow_source_access: value })}
                label="Allow source PDF downloads"
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              When off, visitors see citation page numbers but cannot open the underlying documents.
            </p>

            <label className="block pt-1 border-t border-slate-100">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Allowed Domains
              </span>
              <textarea
                value={originsDraft}
                rows={3}
                placeholder="https://example.com"
                disabled={saving}
                onChange={e => setOriginsDraft(e.target.value)}
                className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-mono outline-none focus:border-indigo-600 focus:bg-white transition"
              />
            </label>
            <button
              onClick={() => persist({ allowed_origins: origins })}
              disabled={saving}
              className="w-full text-[11px] font-bold text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
            >
              Save Domains
            </button>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              Leave empty to allow any domain.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition shrink-0 disabled:opacity-50 ${
        checked ? 'bg-indigo-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}
