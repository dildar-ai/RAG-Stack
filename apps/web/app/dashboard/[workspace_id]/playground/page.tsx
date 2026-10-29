'use client'

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { sendChatMessage, getDocumentUrl, ApiError, type CitationPayload } from '@/lib/apiClient';
import PdfViewer from '@/components/PdfViewer';
import { useParams } from 'next/navigation';
import { MessageSquare, Bot, Send, FileText, Loader2, Sparkles, AlertCircle } from 'lucide-react';

// Citation shape is owned by the API client so both surfaces stay in sync
type Citation = CitationPayload;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isError?: boolean;
}

interface StoredMessage {
  role: string;
  content: string;
  citations: unknown;
}

// Number of previous turns replayed to the model for conversational context
const HISTORY_TURNS = 6;

export default function PlaygroundPage() {
  const params = useParams();
  const workspace_id = params.workspace_id as string;

  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [citationUrlLoading, setCitationUrlLoading] = useState(false);
  // Bumps on every failed persistence attempt so the UI can surface a warning
  const [syncWarning, setSyncWarning] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loadingChat]);

  useEffect(() => {
    initChat();
    // Intentional mount-only chat restore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace_id]);

  const initChat = async () => {
    const { data: latestChat } = await supabase
      .from('chats')
      .select('id')
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (latestChat) {
      setCurrentChatId(latestChat.id);
      const { data: pastMsgs } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', latestChat.id)
        .order('created_at', { ascending: true });
      
      if (pastMsgs) {
        setMessages(pastMsgs.map((m: StoredMessage) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          // Restore citation chips from the persisted JSONB payload
          citations: Array.isArray(m.citations) ? (m.citations as Citation[]) : undefined,
        })));
      }
    } else {
      const { data: newChat } = await supabase.from('chats').insert({ workspace_id }).select('id').single();
      if (newChat) setCurrentChatId(newChat.id);
    }
  };

  const handleNewChat = async () => {
    setMessages([]);
    const { data: newChat } = await supabase.from('chats').insert({ workspace_id }).select('id').single();
    if (newChat) setCurrentChatId(newChat.id);
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loadingChat) return;

    const userMsg = query;

    // Build conversation context from prior turns before appending the new one
    const history = messages
      .filter(m => !m.isError)
      .slice(-HISTORY_TURNS)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setQuery('');
    setLoadingChat(true);
    setSyncWarning(false);

    try {
      // 1. Ask the RAG backend (authenticated + workspace-scoped)
      const data = await sendChatMessage(workspace_id, userMsg, history);

      setMessages(prev => [...prev, { role: 'assistant', content: data.answer, citations: data.citations }]);

      // 2. Persist the turn. History storage failures must not discard the answer.
      if (currentChatId) {
        try {
          await supabase.from('messages').insert([
            { chat_id: currentChatId, workspace_id, role: 'user', content: userMsg },
            { chat_id: currentChatId, workspace_id, role: 'assistant', content: data.answer, citations: data.citations },
          ]);
        } catch (e) {
          console.error('Failed to persist chat history:', e);
          setSyncWarning(true);
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: err instanceof ApiError && err.status === 401
          ? "Your session expired. Please sign in again to continue."
          : err instanceof Error && err.message
            ? err.message
            : "Failed to communicate with the RAG server. Ensure the backend API is running.",
        isError: true
      }]);
    } finally {
      setLoadingChat(false);
    }
  };

  // Signed URLs are short-lived, so request a fresh one on every click
  const viewCitation = async (citation: Citation) => {
    setActiveCitation(citation);
    setCitationUrlLoading(true);
    try {
      const { url } = await getDocumentUrl(workspace_id, citation.document_id);
      setActivePdfUrl(url);
    } catch (err) {
      console.error('Failed to load source PDF:', err);
      setActiveCitation(null);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err instanceof Error && err.message
          ? err.message
          : "Could not open the source document.",
        isError: true,
      }]);
    } finally {
      setCitationUrlLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full p-6 max-w-5xl mx-auto font-sans">
      
      {/* Header */}
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <Bot className="w-6 h-6 text-indigo-600" />
            <span>RAG Playground</span>
          </h1>
          <p className="text-slate-500 text-xs font-medium mt-0.5">Test semantic vector retrieval & real-time PDF citations directly against your indexed files.</p>
        </div>
        <button 
          onClick={handleNewChat}
          className="text-xs font-bold text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 hover:border-indigo-200 transition shadow-xs flex items-center space-x-2 active:scale-95"
        >
          <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
          <span>New Thread</span>
        </button>
      </div>

      {/* Chat Box Frame */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col overflow-hidden min-h-0">
        
        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-3 border border-indigo-100 text-indigo-600 shadow-inner">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Start testing your RAG Assistant</h3>
              <p className="text-slate-500 text-xs font-medium max-w-sm mt-1 leading-relaxed">
                Ask a specific question about your uploaded PDFs. The engine will retrieve the most relevant semantic chunks and cite exact source page coordinates.
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200/80 text-slate-800 rounded-2xl rounded-tl-xs px-4 py-3 max-w-[80%] shadow-2xs text-xs font-medium leading-relaxed">
                  <p>Hello! I am your intelligent workspace assistant. Ask me anything concerning your indexed Knowledge Base documents.</p>
                </div>
              </div>

              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-2xs text-xs font-medium leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-slate-900 text-white rounded-tr-xs' 
                      : msg.isError
                      ? 'bg-red-50 border border-red-200 text-red-700 rounded-tl-xs flex items-center space-x-2'
                      : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-xs'
                  }`}>
                    {msg.isError && <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />}
                    <div className="space-y-2">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="pt-2.5 mt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                          <span className="text-[10px] font-extrabold uppercase text-slate-400 self-center mr-1">Sources:</span>
                          {msg.citations.map((cit, cidx) => (
                            <button 
                              key={cidx}
                              onClick={() => viewCitation(cit)}
                              disabled={citationUrlLoading}
                              title={cit.text}
                              className="inline-flex items-center space-x-1 text-[11px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg hover:bg-indigo-600 hover:text-white transition font-bold border border-indigo-100 shadow-2xs disabled:opacity-60"
                            >
                              {citationUrlLoading
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <FileText className="w-3 h-3" />}
                              <span>[{cit.marker ?? cidx + 1}] {cit.filename.replace(/\.pdf$/i, '')} · P{cit.page}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {syncWarning && (
                <div className="flex justify-center">
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    Answer received, but chat history could not be saved to Supabase.
                  </span>
                </div>
              )}

              {loadingChat && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-xs px-4 py-3 max-w-[80%] shadow-2xs flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span className="text-xs font-semibold text-slate-500">Synthesizing citations and streaming response...</span>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="bg-white p-3.5 border-t border-slate-200/80 shrink-0">
          <form onSubmit={handleChat} className="flex relative w-full">
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loadingChat}
              placeholder="Ask a question about your documents..."
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-4 pr-12 py-2.5 text-xs font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition shadow-inner"
            />
            <button 
              type="submit"
              disabled={loadingChat || !query.trim()}
              className="absolute right-1.5 top-1.5 bottom-1.5 w-9 flex items-center justify-center text-white bg-indigo-600 disabled:opacity-50 hover:bg-indigo-700 rounded-lg transition"
            >
              <Send className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </form>
        </div>
      </div>

      {/* PDF Modal */}
      {activeCitation && activePdfUrl && (
        <PdfViewer 
          url={activePdfUrl} 
          pageNumber={activeCitation.page} 
          bbox={activeCitation.bbox} 
          filename={activeCitation.filename}
          onClose={() => { setActiveCitation(null); setActivePdfUrl(null); }} 
        />
      )}
    </div>
  );
}
