'use client'

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { deleteDocument } from '@/lib/apiClient';
import { useParams } from 'next/navigation';
import { FileText, Loader2, UploadCloud, Search, Trash2, Database } from 'lucide-react';

interface DocRecord {
  id: string;
  workspace_id: string;
  filename: string;
  storage_path: string | null;
  status: string;
  created_at: string;
}

export default function DocumentsPage() {
  const params = useParams();
  const workspace_id = params.workspace_id as string;
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDocs();
    const handleRefresh = () => fetchDocs();
    window.addEventListener('documentUploaded', handleRefresh);
    return () => window.removeEventListener('documentUploaded', handleRefresh);
    // Intentional mount-only load; refreshes come via the custom event
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace_id]);

  const fetchDocs = async () => {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false });

    if (data) setDocs(data);
    setLoading(false);
  };

  const deleteDoc = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document from vector storage?")) return;

    setDeletingId(id);
    try {
      // Single authoritative delete: Qdrant vectors + Supabase Storage + DB row
      await deleteDocument(workspace_id, id);
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error("Delete error:", err);
      alert(err instanceof Error ? err.message : "Failed to delete the document.");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredDocs = docs.filter(doc => 
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="h-[80vh] flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2.5">
            <Database className="w-6 h-6 text-indigo-600" />
            <span>Knowledge Base</span>
          </h1>
          <p className="text-slate-500 text-xs font-medium mt-1">Manage the indexed PDF documents your RAG assistant uses to retrieve grounded citations.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search filenames..." 
            className="pl-9 pr-4 py-2 w-full bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-xs transition"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {docs.length === 0 ? (
          <div className="py-20 px-8 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4 border border-indigo-100">
              <UploadCloud className="w-7 h-7 text-indigo-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">No documents uploaded</h3>
            <p className="text-slate-500 text-xs font-medium max-w-sm mb-6">Upload your first PDF document to build your searchable vector Knowledge Base.</p>
            <button 
              onClick={() => window.dispatchEvent(new Event('openUploadModal'))}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl text-xs font-bold transition shadow-sm"
            >
              Upload New Document
            </button>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs font-medium">
            No documents found matching &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider font-extrabold border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5">Filename</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Uploaded Date</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 font-medium divide-y divide-slate-100">
                {filteredDocs.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50/60 transition group">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-100">
                          <FileText className="w-4 h-4" />
                        </div>
                        <span className="text-slate-900 font-bold max-w-md truncate">{doc.filename}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-normal">
                      {new Date(doc.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => deleteDoc(doc.id)}
                        disabled={deletingId === doc.id}
                        className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition disabled:opacity-60"
                        title="Delete Document"
                      >
                        {deletingId === doc.id
                          ? <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
