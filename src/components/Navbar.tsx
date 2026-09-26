import React from 'react';
import { Volume2, Sparkles, Globe, Video, Cpu, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  currentStep: string;
  onReset: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentStep, onReset }) => {
  return (
    <header id="app-navbar" className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50 backdrop-blur-md bg-slate-900/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand & Logo */}
        <div id="nav-brand-container" className="flex items-center space-x-3 cursor-pointer" onClick={onReset}>
          <div id="nav-logo-badge" className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-emerald-500 to-teal-500 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Video className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span id="nav-app-title" className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-400 via-emerald-400 to-teal-300">
                Bambara Dubber
              </span>
              <span id="nav-maliba-badge" className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                <Cpu className="w-2.5 h-2.5 mr-0.5" />
                MALIBA-AI
              </span>
            </div>
            <p id="nav-app-subtitle" className="text-xs text-slate-400 font-sans hidden sm:block">
              دبلجة الفيديو إلى البAMBARA • Bamanankan Video Translation Engine
            </p>
          </div>
        </div>

        {/* Status Badges */}
        <div id="nav-status-group" className="flex items-center space-x-3">
          <div id="nav-pipeline-status" className="hidden md:flex items-center space-x-2 text-xs bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60 text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Mode: <strong className="text-amber-300 font-medium">Gemini 3.6 + TTS v3</strong></span>
          </div>

          <div id="nav-engine-pill" className="flex items-center space-x-1.5 text-xs bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 px-2.5 py-1 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium hidden sm:inline">Official Pipeline</span>
            <span className="font-medium sm:hidden">MALIBA</span>
          </div>
        </div>

      </div>
    </header>
  );
};
