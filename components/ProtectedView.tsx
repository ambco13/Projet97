
import React, { useEffect, useState } from 'react';
import { Shield, Mic, MapPin, Zap, Users } from 'lucide-react';
import { Contact } from '../types';

interface Props {
  contacts: Contact[];
  isListening: boolean;
  guardianNetwork: boolean;
  language: string;
  onTrigger: () => void;
  onShowHistory: () => void;
  translations: any;
}

const ProtectedView: React.FC<Props> = ({ contacts, isListening, guardianNetwork, language, onTrigger, onShowHistory, translations: t }) => {
  const [pulse, setPulse] = useState(false);
  const [guardianCount, setGuardianCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 2000);
    setGuardianCount(Math.floor(Math.random() * 8) + 3);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full p-8 animate-in fade-in zoom-in-95 duration-1000">
      <div className="flex-1 flex flex-col items-center justify-center gap-10">
        <div className="relative">
          <div className={`absolute inset-[-40px] border border-green-500/10 rounded-full transition-transform duration-[2000ms] ${pulse ? 'scale-110 opacity-50' : 'scale-90 opacity-0'}`}></div>
          <div className={`absolute inset-[-20px] border border-green-500/20 rounded-full transition-transform duration-[1500ms] ${pulse ? 'scale-105 opacity-70' : 'scale-95 opacity-0'}`}></div>
          
          <div className="relative z-10 w-52 h-52 rounded-full bg-neutral-950 border-[3px] border-green-500/50 flex flex-col items-center justify-center shadow-[0_0_80px_rgba(34,197,94,0.15)] group transition-all active:scale-95">
            <div className="absolute inset-2 border border-green-500/10 rounded-full animate-[spin_8s_linear_infinite]"></div>
            <Shield size={72} className="text-green-500 mb-2 drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]" fill="currentColor" fillOpacity={0.1} />
            <div className="h-1 w-12 bg-green-500/30 rounded-full mb-2"></div>
            <span className="text-[10px] font-black tracking-[0.4em] text-green-500 uppercase ml-[0.4em]">{t.active}</span>
          </div>

          {guardianNetwork && (
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 px-4 py-1 rounded-full border border-blue-400/30 flex items-center gap-2 shadow-lg animate-bounce">
              <Users size={12} className="text-white" />
              <span className="text-[10px] font-black text-white uppercase tracking-wider">{guardianCount} {t.guardianNet}</span>
            </div>
          )}
        </div>

        <div className="text-center space-y-3">
          <h2 className="text-3xl font-black text-white tracking-tighter">{t.protectionActive}</h2>
          <p className="text-neutral-500 text-sm font-medium leading-relaxed max-w-[280px] mx-auto">
            {t.voiceInstruction}
          </p>
        </div>

        <div className="w-full grid grid-cols-2 gap-4">
          <div className="bg-neutral-900/40 p-5 rounded-[2.5rem] border border-white/5 backdrop-blur-sm relative overflow-hidden flex flex-col items-center text-center">
            <div className="flex items-center justify-center mb-3 relative">
              <Mic size={22} className={isListening ? "text-green-500 animate-pulse" : "text-neutral-600"} />
              {isListening && (
                <div className="absolute -top-1 -right-4 flex gap-0.5">
                  <div className="w-0.5 h-2 bg-green-500/50 rounded-full animate-[bounce_0.8s_infinite_100ms]"></div>
                  <div className="w-0.5 h-3 bg-green-500/80 rounded-full animate-[bounce_0.8s_infinite_300ms]"></div>
                </div>
              )}
            </div>
            <p className="text-[9px] font-black text-neutral-600 uppercase tracking-widest mb-1">{t.microphone}</p>
            <p className="text-sm font-black text-white tracking-tight">{t.listening}</p>
          </div>
          <div className="bg-neutral-900/40 p-5 rounded-[2.5rem] border border-white/5 backdrop-blur-sm flex flex-col items-center text-center relative">
            <MapPin size={22} className="text-blue-500 mb-3" />
            <p className="text-[9px] font-black text-neutral-600 uppercase tracking-widest mb-1">{t.gpsMesh}</p>
            <p className="text-sm font-black text-white uppercase tracking-tighter">{guardianNetwork ? t.community : t.private}</p>
          </div>
        </div>
      </div>

      <div className="mt-auto space-y-6">
        <div className="bg-neutral-900/60 p-5 rounded-[2rem] border border-white/5 flex items-center gap-4">
          <div className="bg-red-500/10 p-3 rounded-2xl">
            <Zap className="text-red-500" size={20} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-neutral-500 font-black uppercase mb-1">{t.alertNetwork}</p>
            <p className="text-white text-xs font-bold">
              {contacts.length} {t.contacts} {guardianNetwork ? `+ ${t.guardianNet}` : ''}
            </p>
          </div>
        </div>

        <button 
          onClick={onTrigger}
          className="w-full bg-white text-black font-black py-5 rounded-[2rem] shadow-2xl hover:bg-red-600 hover:text-white transition-all transform active:scale-[0.98] uppercase tracking-[0.2em] text-xs"
        >
          {t.manualSos}
        </button>
      </div>
    </div>
  );
};

export default ProtectedView;
