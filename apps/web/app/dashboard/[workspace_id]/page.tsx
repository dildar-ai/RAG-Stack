'use client'

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
import { 
  MessageSquare, FileText, UploadCloud, Loader2, Bot, Code, Database, ArrowRight, CheckCircle2
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardOverview() {
  const params = useParams();
  const workspace_id = params.workspace_id as string;
  const [userName, setUserName] = useState('User');

  // Real Data State
  const [recentDocs, setRecentDocs] = useState<{ id: string; filename: string; status: string; created_at: string }[]>([]);
  const [docCount, setDocCount] = useState<number>(0);
  const [chatStats, setChatStats] = useState({ totalChats: 0, totalMessages: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();

    // Re-fetch data whenever an upload completes
    const handleUploadRefresh = () => fetchDashboardData();
    window.addEventListener('documentUploaded', handleUploadRefresh);
    return () => window.removeEventListener('documentUploaded', handleUploadRefresh);
    // Intentional mount-only load; refreshes come via the custom event
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace_id]);

  const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('company_name').eq('id', user.id).single();
      if (profile?.company_name) {
        setUserName(profile.company_name);
      } else if (user.email) {
        setUserName(user.email.split('@')[0] || 'User');
      }
    }

    // Fetch Documents
    const { data: docs } = await supabase
      .from('documents')
      .select('*')
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false });

    if (docs) {
      setRecentDocs(docs.slice(0, 5));
      setDocCount(docs.length);
    }

    // Fetch Real Analytics
    const { count: chatCount } = await supabase.from('chats').select('*', { count: 'exact', head: true }).eq('workspace_id', workspace_id);
    const { count: msgCount } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', workspace_id);
    
    setChatStats({
      totalChats: chatCount || 0,
      totalMessages: msgCount || 0
    });

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="h-[80vh] flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // ZERO STATE ONBOARDING (No documents indexed)
  if (docCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] max-w-lg mx-auto text-center px-4 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 border border-indigo-100 shadow-inner">
          <FileText className="w-8 h-8 text-indigo-600" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Welcome to your Workspace</h1>
        <p className="text-slate-500 font-medium mb-8 leading-relaxed text-sm">
          Your Knowledge Base is currently empty. Upload your first PDF document so the AI assistant can index its contents and answer user queries with verifiable citations.
        </p>
        <button 
          onClick={() => window.dispatchEvent(new Event('openUploadModal'))}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition active:scale-95 flex items-center space-x-2"
        >
          <UploadCloud className="w-5 h-5" />
          <span>Upload First PDF Document</span>
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 font-sans">
      
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Workspace Overview</h1>
          <p className="text-slate-500 text-xs font-medium">Welcome back, <span className="font-bold text-slate-700">{userName}</span>. Here is the active status of your RAG assistant.</p>
        </div>
        <div className="flex items-center space-x-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-200/60 text-xs font-bold shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>RAG Pipeline Active & Ready</span>
        </div>
      </div>

      {/* Real Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <MetricCard 
          title="Indexed Documents" 
          value={docCount.toString()} 
          subtitle="Ready for vector retrieval" 
          icon={<Database className="w-5 h-5 text-indigo-600" />} 
          bg="bg-indigo-50/80 border-indigo-100" 
        />
        <MetricCard 
          title="Playground Sessions" 
          value={chatStats.totalChats.toString()} 
          subtitle="Unique conversation threads" 
          icon={<Bot className="w-5 h-5 text-purple-600" />} 
          bg="bg-purple-50/80 border-purple-100" 
        />
        <MetricCard 
          title="Messages Exchanged" 
          value={chatStats.totalMessages.toString()} 
          subtitle="Total questions & answers" 
          icon={<MessageSquare className="w-5 h-5 text-blue-600" />} 
          bg="bg-blue-50/80 border-blue-100" 
        />
      </div>

      {/* Quick Action Hub */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Next Steps & Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <ActionCard 
            title="Test in Playground"
            description="Run semantic RAG queries against your indexed PDFs and test real-time page citations."
            href={`/dashboard/${workspace_id}/playground`}
            icon={<Bot className="w-5 h-5 text-indigo-600" />}
            linkText="Open Playground"
          />
          <ActionCard 
            title="Manage Knowledge Base"
            description="Upload additional documents, inspect vector indexing status, and manage workspace storage."
            href={`/dashboard/${workspace_id}/documents`}
            icon={<Database className="w-5 h-5 text-indigo-600" />}
            linkText="View Documents"
          />
          <ActionCard 
            title="Deploy Widget Code"
            description="Copy the production embedded script tag to insert this AI assistant onto your website."
            href={`/dashboard/${workspace_id}/settings`}
            icon={<Code className="w-5 h-5 text-indigo-600" />}
            linkText="Get Embed Code"
          />
        </div>
      </div>

      {/* Recent Documents Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Recently Indexed Documents</h3>
          <Link href={`/dashboard/${workspace_id}/documents`} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition flex items-center space-x-1">
            <span>View All ({docCount})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider font-extrabold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3">Document Name</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Upload Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {recentDocs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-3.5 font-bold text-slate-900 flex items-center space-x-2.5">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate max-w-md">{doc.filename}</span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/60 inline-flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span>{doc.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right text-slate-500 font-normal">
                    {new Date(doc.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  subtitle: string;
  icon: React.ReactNode;
  bg: string;
}

function MetricCard({ title, value, subtitle, icon, bg }: MetricCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between space-y-4">
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        <div className={`p-2.5 rounded-xl border ${bg}`}>{icon}</div>
      </div>
      <div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">{value}</h2>
        <p className="text-[11px] font-medium text-slate-500 mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

interface ActionCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  linkText: string;
}

function ActionCard({ title, description, href, icon, linkText }: ActionCardProps) {
  return (
    <Link 
      href={href} 
      className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md hover:border-indigo-300 transition flex flex-col justify-between group"
    >
      <div className="space-y-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200">
          {icon}
        </div>
        <div>
          <h4 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition">{title}</h4>
          <p className="text-xs font-medium text-slate-500 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
        <span>{linkText}</span>
        <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
}
