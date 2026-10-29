'use client'

import React, { useEffect, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { uploadDocument, ApiError } from '@/lib/apiClient';
import { 
  Settings, Database, ChevronDown, LayoutDashboard, 
  FileText, Bot, Users, Puzzle, CreditCard, Plus, UploadCloud, Loader2, X, Code, LogOut
} from 'lucide-react';
import Link from 'next/link';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const workspace_id = params.workspace_id as string;
  const router = useRouter();
  const pathname = usePathname();
  const [workspaceName, setWorkspaceName] = useState('Loading...');
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('User');
  
  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // Workspace Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetchWorkspace();
    fetchUser();

    // Listen for requests to open the upload modal from child components (like zero-state)
    const openUploadHandler = () => setIsUploadOpen(true);
    window.addEventListener('openUploadModal', openUploadHandler);
    return () => window.removeEventListener('openUploadModal', openUploadHandler);
    // Intentional mount-only load; router.push guards stale workspaces
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace_id]);

  // Keep the browser signed-in session alive so long document processing never 401s
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && event === 'SIGNED_OUT') {
        window.location.href = '/login';
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchWorkspace = async () => {
    // Back/forward navigation can restore this page from browser cache after
    // sign-out without ever hitting the server guard, so verify the session
    // client-side and bounce manually instead of looping on "Loading...".
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return;
    }

    const { data: userWorkspaces } = await supabase
      .from('workspaces')
      .select('id, name');
    
    if (userWorkspaces && userWorkspaces.length > 0) {
      setWorkspaces(userWorkspaces);
      const current = userWorkspaces.find(w => w.id === workspace_id);
      if (current) {
        setWorkspaceName(current.name);
      } else {
        router.push('/dashboard');
      }
    }
  };

  const fetchUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserEmail(user.email || '');
      // Fetch profile to get real company/display name
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_name')
        .eq('id', user.id)
        .single();
      
      if (profile?.company_name) {
        setUserDisplayName(profile.company_name);
      } else if (user.email) {
        setUserDisplayName(user.email.split('@')[0] || 'User');
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadSuccess(false);
    setUploadError(null);

    try {
      // The API parses, embeds, stores the PDF in Supabase Storage and writes the
      // DB record in one authoritative flow, scoped to the authenticated user.
      await uploadDocument(workspace_id, file);

      setUploadSuccess(true);
      setFile(null);

      // Notify components and cleanly close modal
      setTimeout(() => {
        setIsUploadOpen(false);
        setUploadSuccess(false);
        window.dispatchEvent(new Event('documentUploaded'));
        router.refresh();
      }, 1500);

    } catch (err) {
      console.error("Upload error:", err);
      setUploadError(
        err instanceof ApiError && err.status === 401
          ? "Your session expired. Please sign in again."
          : err instanceof Error && err.message
            ? err.message
            : "Failed to upload document."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-800">
      
      {/* Sidebar - Clean & Structured */}
      <aside className="w-[260px] bg-white border-r border-slate-200/80 flex flex-col fixed inset-y-0 left-0 z-20 shadow-[1px_0_4px_rgba(0,0,0,0.02)]">
        
        {/* Logo */}
        <div className="h-16 flex items-center px-5 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
          <img src="/logo.png" alt="RAG Stack" className="h-9 w-auto object-contain shrink-0" />
        </div>

        {/* Workspace Switcher */}
        <div className="p-3.5 relative">
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl transition text-left relative z-30"
          >
            <div className="flex items-center space-x-2.5 truncate">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm shadow-indigo-500/20">
                {workspaceName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col truncate">
                <span className="text-xs font-bold text-slate-800 truncate">{workspaceName}</span>
                <span className="text-[10px] text-slate-500 font-medium">Active Workspace</span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
          </button>
          
          {isDropdownOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setIsDropdownOpen(false)}></div>
              <div className="absolute top-[68px] left-3.5 right-3.5 bg-white border border-slate-200 rounded-xl shadow-xl z-40 py-1.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Switch Workspace</div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {workspaces.map(ws => (
                    <Link 
                      key={ws.id} 
                      href={`/dashboard/${ws.id}`}
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center justify-between px-3.5 py-2 hover:bg-indigo-50/50 transition cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-700 truncate">{ws.name}</span>
                      {ws.id === workspace_id && <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full shrink-0 ml-2"></div>}
                    </Link>
                  ))}
                </div>
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <Link href="/dashboard" onClick={() => setIsDropdownOpen(false)} className="flex items-center px-3.5 py-2 text-indigo-600 hover:bg-indigo-50/50 transition cursor-pointer space-x-2">
                    <Plus className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">Manage / Create New</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-1 space-y-1 overflow-y-auto scrollbar-hide">
          <NavItem 
            icon={<LayoutDashboard />} 
            label="Overview" 
            href={`/dashboard/${workspace_id}`} 
            isActive={pathname === `/dashboard/${workspace_id}`}
          />
          
          <div className="py-2">
            <div className="px-3 pb-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">RAG Core</div>
            <div className="space-y-0.5">
              <NavItem 
                icon={<Database />} 
                label="Knowledge Base" 
                href={`/dashboard/${workspace_id}/documents`} 
                isActive={pathname.includes('/documents')}
              />
              <NavItem 
                icon={<Bot />} 
                label="Playground" 
                href={`/dashboard/${workspace_id}/playground`} 
                isActive={pathname.includes('/playground')}
              />
              <NavItem 
                icon={<Code />} 
                label="Deploy Widget" 
                href={`/dashboard/${workspace_id}/settings`} 
                isActive={pathname.includes('/settings')}
              />
            </div>
          </div>
          
          <div className="py-1">
            <div className="px-3 pb-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Organization</div>
            <div className="space-y-0.5">
              <NavItem 
                icon={<Users />} 
                label="Team" 
                href={`/dashboard/${workspace_id}/team`} 
                isActive={pathname.includes('/team')}
              />
              <NavItem 
                icon={<Puzzle />} 
                label="Integrations" 
                href={`/dashboard/${workspace_id}/integrations`} 
                isActive={pathname.includes('/integrations')}
              />
              <NavItem 
                icon={<CreditCard />} 
                label="Billing" 
                href={`/dashboard/${workspace_id}/billing`} 
                isActive={pathname.includes('/billing')}
              />
              <NavItem 
                icon={<Settings />} 
                label="Settings" 
                href={`/dashboard/${workspace_id}/workspace-settings`} 
                isActive={pathname.includes('/workspace-settings')}
              />
            </div>
          </div>
        </nav>

        {/* User Footer with Real Data & Sign Out */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 overflow-hidden pr-2">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
              {userDisplayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-bold text-slate-800 truncate">{userDisplayName}</span>
              <span className="text-[10px] text-slate-500 font-medium truncate">{userEmail}</span>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            title="Sign Out"
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-[260px] flex flex-col min-h-screen overflow-x-hidden relative">
        
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200/80 shrink-0 sticky top-0 z-10">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500">
            <span>Workspace</span>
            <span>/</span>
            <span className="text-slate-800 font-bold">{workspaceName}</span>
          </div>
          
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setIsUploadOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-sm shadow-indigo-500/20 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>New Document</span>
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" onClick={() => !uploading && setIsUploadOpen(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-6 animate-in zoom-in-95 duration-200 border border-slate-100">
            <button 
              onClick={() => !uploading && setIsUploadOpen(false)} 
              disabled={uploading}
              className="absolute top-4 right-4 text-slate-400 hover:bg-slate-100 p-1.5 rounded-full transition disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="space-y-1 mb-6">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center space-x-2">
                <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <span>Upload to Knowledge Base</span>
              </h2>
              <p className="text-xs font-medium text-slate-500 pl-1">Add a PDF document to be indexed for semantic vector retrieval.</p>
            </div>

            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center space-y-4 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-indigo-500 shadow-sm border border-slate-100">
                <FileText className="w-5 h-5" />
              </div>
              
              <div className="w-full text-center">
                <input 
                  type="file" 
                  accept="application/pdf"
                  disabled={uploading}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 transition cursor-pointer"
                />
              </div>
              
              <button 
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full bg-slate-900 text-white text-xs font-bold py-3 rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-all flex justify-center items-center shadow-md shadow-slate-900/10"
              >
                {uploading ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Parsing & Embedding...</span>
                  </div>
                ) : "Upload & Process Document"}
              </button>

              {uploadSuccess && (
                <div className="w-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl text-xs font-bold text-center flex items-center justify-center space-x-2 animate-in fade-in">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span>Document processed and uploaded successfully!</span>
                </div>
              )}
              {uploadError && (
                <div className="w-full bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs font-semibold text-center leading-tight">
                  {uploadError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ icon, label, href, isActive }: { icon: React.ReactNode, label: string, href: string, isActive: boolean }) {
  return (
    <Link 
      href={href}
      className={`flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold transition ${
        isActive 
          ? 'bg-indigo-50 text-indigo-700 font-bold shadow-xs' 
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <div className={`w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 ${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>{icon}</div>
      <span>{label}</span>
    </Link>
  );
}
