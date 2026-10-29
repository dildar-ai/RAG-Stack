'use client'

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Folder, ArrowRight, LayoutGrid } from 'lucide-react';
import Link from 'next/link';

interface Workspace {
  id: string;
  name: string;
}

export default function WorkspaceSelector() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  
  const router = useRouter();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
        setWorkspaces(data);
      }
    } else {
      // Restored from browser cache after sign-out: leave no stale shell behind
      router.replace('/login');
      return;
    }
    setLoading(false);
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data, error } = await supabase
        .from('workspaces')
        .insert([{ name: newWorkspaceName.trim(), owner_id: user.id }])
        .select()
        .single();
        
      if (!error && data) {
        setWorkspaces([data, ...workspaces]);
        setNewWorkspaceName('');
      } else {
        alert("Failed to create workspace");
      }
    }
    setCreating(false);
  };

  const selectWorkspace = (id: string) => {
    router.push(`/dashboard/${id}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 relative z-10" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-20 px-4 relative overflow-hidden font-sans">
      
      {/* Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.015] pointer-events-none mix-blend-overlay"></div>

      {/* Header Bar */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-20">
        <div className="flex items-center space-x-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
          <img src="/logo.png" alt="RAG Stack" className="h-10 w-auto object-contain drop-shadow-sm" />
          <span className="text-xl font-bold text-slate-800 tracking-tight">RAG Stack</span>
        </div>
        <div className="flex items-center space-x-4">
          <Link href="/pricing" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition">Pricing</Link>
          <button onClick={handleLogout} className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition bg-white px-4 py-2 rounded-full shadow-sm border border-slate-200">Sign Out</button>
        </div>
      </div>

      <div className="max-w-4xl w-full space-y-12 relative z-10 mt-10">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm border border-slate-200/60 mb-4">
            <LayoutGrid className="w-6 h-6 text-indigo-600" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Your Workspaces</h1>
          <p className="text-slate-500 text-lg max-w-xl mx-auto font-medium">Select a workspace to manage your knowledge base or create a new one to start a fresh context.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Create New Workspace Card */}
          <div className="bg-white/60 backdrop-blur-xl border border-dashed border-indigo-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-5 hover:bg-white hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 cursor-pointer group"
               onClick={() => document.getElementById('create-form')?.focus()}
          >
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-inner">
              <Plus className="w-7 h-7" />
            </div>
            <form id="create-form" onSubmit={handleCreateWorkspace} className="w-full space-y-4">
              <div className="space-y-2">
                <input 
                  type="text" 
                  placeholder="New Workspace Name..." 
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/80 border border-slate-200/80 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm transition-all text-center placeholder:text-slate-400"
                />
              </div>
              <button 
                type="submit" 
                disabled={creating || !newWorkspaceName.trim()}
                className="w-full bg-slate-900 text-white text-sm font-semibold py-3 rounded-xl hover:bg-indigo-600 disabled:opacity-50 flex justify-center items-center shadow-lg shadow-slate-900/10 transition-colors"
              >
                {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Workspace"}
              </button>
            </form>
          </div>

          {/* Existing Workspaces */}
          {workspaces.map((ws) => (
            <div 
              key={ws.id} 
              onClick={() => selectWorkspace(ws.id)}
              className="bg-white border border-slate-200/80 rounded-3xl p-6 hover:shadow-xl hover:shadow-indigo-500/5 hover:border-indigo-300 transition-all duration-300 cursor-pointer flex flex-col items-start relative group overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-500"></div>
              
              <div className="w-12 h-12 bg-slate-50 border border-slate-100 text-slate-600 rounded-2xl flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-colors shadow-sm mb-6 relative z-10">
                <Folder className="w-6 h-6" />
              </div>
              
              <div className="relative z-10 flex-1 w-full">
                <h3 className="font-extrabold text-slate-800 text-xl group-hover:text-indigo-700 transition-colors line-clamp-1">{ws.name}</h3>
                <p className="text-slate-400 text-xs font-medium mt-1.5 font-mono">ID: {ws.id.substring(0,12)}...</p>
              </div>

              <div className="w-full flex justify-end mt-4 relative z-10">
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 group-hover:translate-x-1">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
