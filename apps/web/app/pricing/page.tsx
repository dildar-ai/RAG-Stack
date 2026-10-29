'use client'

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, X, ArrowLeft } from 'lucide-react';

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="min-h-screen bg-slate-50 font-sans relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.015] pointer-events-none mix-blend-overlay"></div>

      {/* Header */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-20">
        <Link href="/dashboard" className="flex items-center space-x-2 text-slate-500 hover:text-indigo-600 transition font-medium">
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </Link>
        <div className="flex items-center space-x-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
          <img src="/logo.png" alt="RAG Stack" className="h-10 w-auto object-contain drop-shadow-sm" />
          <span className="text-xl font-bold text-slate-800 tracking-tight">RAG Stack</span>
        </div>
        <div className="w-16"></div> {/* Spacer */}
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-32 pb-24 relative z-10">
        
        {/* Title Section */}
        <div className="text-center max-w-3xl mx-auto space-y-6 mb-16">
          <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-slate-500 font-medium leading-relaxed">
            Choose the perfect plan for your knowledge base. Upgrade anytime as your company scales.
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-center space-x-4 mt-8">
            <span className={`text-sm font-semibold ${!annual ? 'text-slate-900' : 'text-slate-500'}`}>Monthly</span>
            <button 
              onClick={() => setAnnual(!annual)}
              className="relative w-16 h-8 bg-indigo-600 rounded-full transition-colors focus:outline-none focus:ring-4 focus:ring-indigo-600/20"
            >
              <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${annual ? 'translate-x-8' : 'translate-x-0'} shadow-sm`}></div>
            </button>
            <span className={`text-sm font-semibold flex items-center ${annual ? 'text-slate-900' : 'text-slate-500'}`}>
              Annually <span className="ml-2 bg-green-100 text-green-700 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold">Save 20%</span>
            </span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-center">
          
          {/* Free Tier */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200/60 shadow-xl shadow-slate-200/30 flex flex-col relative overflow-hidden transition-all hover:border-indigo-200 hover:shadow-indigo-500/5">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Starter</h3>
            <p className="text-sm text-slate-500 font-medium mb-6">Perfect for trying out RAG.</p>
            <div className="flex items-baseline mb-6">
              <span className="text-4xl font-extrabold text-slate-900">$0</span>
              <span className="text-slate-500 font-medium ml-2">/ month</span>
            </div>
            <Link href="/login" className="w-full py-3.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold rounded-xl transition-colors text-center mb-8">
              Get Started
            </Link>
            <div className="space-y-4 flex-1">
              <Feature text="1 Workspace" included={true} />
              <Feature text="3 PDF Documents" included={true} />
              <Feature text="Standard Llama-3 Model" included={true} />
              <Feature text="Visual Citations" included={false} />
              <Feature text="API Access" included={false} />
            </div>
          </div>

          {/* Pro Tier */}
          <div className="bg-indigo-600 rounded-3xl p-8 border border-indigo-500 shadow-2xl shadow-indigo-600/20 flex flex-col relative overflow-hidden transform md:-translate-y-4 z-10">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full -mr-10 -mt-10"></div>
            <div className="absolute top-4 right-4 bg-indigo-500/40 border border-indigo-400 text-indigo-100 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
              Most Popular
            </div>
            
            <h3 className="text-xl font-bold text-white mb-2 relative z-10">Pro</h3>
            <p className="text-sm text-indigo-200 font-medium mb-6 relative z-10">For professionals and small teams.</p>
            <div className="flex items-baseline mb-6 relative z-10">
              <span className="text-4xl font-extrabold text-white">${annual ? '29' : '39'}</span>
              <span className="text-indigo-200 font-medium ml-2">/ month</span>
            </div>
            <Link href="/login" className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 text-indigo-600 font-bold rounded-xl transition-colors text-center mb-8 shadow-lg shadow-indigo-900/20 relative z-10 hover:scale-[1.02] active:scale-[0.98]">
              Upgrade to Pro
            </Link>
            <div className="space-y-4 flex-1 relative z-10">
              <Feature text="Unlimited Workspaces" included={true} dark={true} />
              <Feature text="50 PDF Documents/mo" included={true} dark={true} />
              <Feature text="Nvidia NIM / Groq Fast Models" included={true} dark={true} />
              <Feature text="Visual Citations" included={true} dark={true} />
              <Feature text="Basic API Access" included={false} dark={true} />
            </div>
          </div>

          {/* Enterprise Tier */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200/60 shadow-xl shadow-slate-200/30 flex flex-col relative overflow-hidden transition-all hover:border-indigo-200 hover:shadow-indigo-500/5">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Enterprise</h3>
            <p className="text-sm text-slate-500 font-medium mb-6">Custom limits for large organizations.</p>
            <div className="flex items-baseline mb-6">
              <span className="text-4xl font-extrabold text-slate-900">${annual ? '99' : '119'}</span>
              <span className="text-slate-500 font-medium ml-2">/ month</span>
            </div>
            <Link href="/login" className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors text-center mb-8 shadow-md">
              Contact Sales
            </Link>
            <div className="space-y-4 flex-1">
              <Feature text="Everything in Pro" included={true} />
              <Feature text="Unlimited PDF Documents" included={true} />
              <Feature text="Bring Your Own Models (BYOM)" included={true} />
              <Feature text="Full API Access" included={true} />
              <Feature text="Dedicated Support" included={true} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function Feature({ text, included, dark = false }: { text: string, included: boolean, dark?: boolean }) {
  return (
    <div className={`flex items-center space-x-3 ${!included ? 'opacity-50' : ''}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
        included 
          ? dark ? 'bg-indigo-500/50 text-white' : 'bg-green-100 text-green-600'
          : dark ? 'bg-indigo-800/30 text-indigo-300' : 'bg-slate-100 text-slate-400'
      }`}>
        {included ? <Check className="w-3 h-3 stroke-[3]" /> : <X className="w-3 h-3 stroke-[3]" />}
      </div>
      <span className={`text-sm font-medium ${
        dark 
          ? included ? 'text-white' : 'text-indigo-300' 
          : included ? 'text-slate-700' : 'text-slate-400'
      }`}>
        {text}
      </span>
    </div>
  );
}
