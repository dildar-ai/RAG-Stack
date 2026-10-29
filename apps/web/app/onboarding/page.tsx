'use client'

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();

  useEffect(() => {
    // Check if user already has a profile
    const checkProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('company_name')
          .eq('id', user.id)
          .single();
          
        if (data?.company_name) {
          router.push('/dashboard');
        }
      }
    };
    checkProfile();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setLoading(true);
    setError(null);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          company_name: companyName.trim(),
          industry: industry.trim()
        });

      setLoading(false);

      if (error) {
        setError(error.message);
      } else {
        window.location.href = '/dashboard'; // Force reload so middleware detects profile
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100 p-8 space-y-6">
        
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
            <img src="/logo.png" alt="RAG Stack" className="h-14 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Set up your Workspace</h1>
          <p className="text-slate-500 font-medium text-sm">Tell us about your company to personalize your experience.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Company Name</label>
            <input 
              type="text" 
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:bg-white transition outline-none text-sm"
              placeholder="Acme Corp"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Industry (Optional)</label>
            <input 
              type="text" 
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:bg-white transition outline-none text-sm"
              placeholder="e.g. Healthcare, Finance"
            />
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              disabled={loading || !companyName.trim()}
              className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition flex justify-center items-center shadow-lg shadow-indigo-600/20"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Complete Setup"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
