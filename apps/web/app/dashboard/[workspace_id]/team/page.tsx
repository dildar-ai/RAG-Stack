'use client'

import React from 'react';
import { Users, Clock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function TeamPage() {
  const params = useParams();
  const workspace_id = params.workspace_id as string;

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] p-8 text-center font-sans">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-6 border border-slate-200 shadow-sm text-slate-500">
        <Users className="w-8 h-8" />
      </div>
      
      <span className="px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold text-xs rounded-full uppercase tracking-wider mb-4 flex items-center space-x-1.5">
        <Clock className="w-3.5 h-3.5" />
        <span>In Development</span>
      </span>
      
      <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-3">
        NOT AVAILABLE YET. COMING SOON!
      </h1>
      
      <p className="text-slate-500 font-medium max-w-md mb-8 leading-relaxed text-sm">
        We are actively building fine-grained role-based access control (RBAC), multi-user team invites, and collaborative audit logs for workspaces.
      </p>
      
      <Link 
        href={`/dashboard/${workspace_id}`}
        className="px-6 py-3 bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl transition shadow-md shadow-slate-900/10"
      >
        Return to Overview
      </Link>
    </div>
  );
}
