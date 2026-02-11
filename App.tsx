
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, History, Settings } from 'lucide-react';
import { AppState, Contact, EmergencyLog, AppConfig } from './types';
import SetupView from './components/SetupView';
import ProtectedView from './components/ProtectedView';
import EmergencyView from './components/EmergencyView';
import HistoryView from './components/HistoryView';
import PinPad from './components/PinPad';
import { translations, languages } from './translations';

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>('SETUP');
  const stateRef = useRef<AppState>('SETUP');
  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('p97_config');
    return saved ? JSON.parse(saved) : { pin: '', contacts: [], guardianNetwork: true, language: 'fr' };
  });
  const [logs, setLogs] = useState<EmergencyLog[]>(() => {
    const saved = localStorage.getItem('p97_logs');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeTab, setActiveTab] = useState<'PROTECTED' | 'HISTORY' | 'SETUP'>('PROTECTED');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const currentLang = config.language || 'fr';
  const t = translations[currentLang] || translations.fr;
  const langMeta = languages[currentLang] || languages.fr;

  useEffect(() => {
    if (config.pin && config.contacts.length > 0) {
      setState('PROTECTED');
      setActiveTab('PROTECTED');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('p97_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('p97_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const addLog = useCallback((log: Omit<EmergencyLog, 'id' | 'timestamp'>) => {
    setLogs(prev => [{
      ...log,
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
    } as EmergencyLog, ...prev]);
  }, []);

  const triggerEmergency = useCallback((reason: string) => {
    if (stateRef.current === 'EMERGENCY' || stateRef.current === 'DEACTIVATING') return;
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        addLog({
          type: 'TRIGGER',
          detail: `${reason} (${config.language.toUpperCase()})`,
          coordinates: { lat: pos.coords.latitude, lng: pos.coords.longitude }
        });
      },
      () => {
        addLog({ type: 'TRIGGER', detail: `${reason} (No GPS)` });
      },
      GEO_OPTIONS
    );
    setState('EMERGENCY');
  }, [addLog, config.language]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = langMeta.locale || 'fr-FR';
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const result = event.results[event.results.length - 1][0].transcript.toLowerCase();
        if (result.includes('97')) {
          triggerEmergency('VOICE COMMAND');
        }
      };
      recognition.onend = () => {
        setIsListening(false);
        if (stateRef.current === 'PROTECTED') {
          setTimeout(() => { if (stateRef.current === 'PROTECTED') recognition.start(); }, 300);
        }
      };
      recognition.onerror = () => setIsListening(false);
      try { recognition.start(); recognitionRef.current = recognition; } catch (e) { setIsListening(false); }
    }
  }, [triggerEmergency, langMeta.locale]);

  useEffect(() => {
    if (state === 'PROTECTED') {
      startListening();
    } else {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
        recognitionRef.current = null;
      }
      setIsListening(false);
    }
  }, [state, startListening]);

  const handleFinishSetup = (contacts: Contact[], pin: string, guardianNetwork: boolean, language: string) => {
    setConfig({ pin, contacts, guardianNetwork, language });
    setState('PROTECTED');
    setActiveTab('PROTECTED');
  };

  const showNav = config.pin && state !== 'EMERGENCY' && state !== 'DEACTIVATING';

  return (
    <div 
      className="flex flex-col h-screen max-w-md mx-auto bg-[#050505] shadow-2xl overflow-hidden relative border-x border-neutral-900"
      dir={langMeta.dir}
    >
      <div className={`absolute inset-0 transition-opacity duration-1000 pointer-events-none z-0 ${state === 'EMERGENCY' ? 'opacity-100' : 'opacity-0'}`}>
         <div className="absolute inset-0 bg-red-950/20 emergency-pulse" />
      </div>

      <div className="flex-1 relative z-10 overflow-y-auto overflow-x-hidden pb-24">
        {(!config.pin || activeTab === 'SETUP') && state !== 'EMERGENCY' && state !== 'DEACTIVATING' && (
          <SetupView 
            onComplete={handleFinishSetup} 
            onCancel={() => { setActiveTab('PROTECTED'); setState('PROTECTED'); }}
            initialConfig={config} 
            hideHeader={config.pin !== ''}
            translations={t}
          />
        )}
        
        {config.pin && activeTab === 'PROTECTED' && state === 'PROTECTED' && (
          <ProtectedView 
            contacts={config.contacts} 
            isListening={isListening}
            guardianNetwork={config.guardianNetwork}
            language={config.language}
            onTrigger={() => triggerEmergency('MANUAL SOS')} 
            onShowHistory={() => setActiveTab('HISTORY')}
            translations={t}
          />
        )}

        {state === 'EMERGENCY' && <EmergencyView contacts={config.contacts} language={config.language} onDeactivate={() => setState('DEACTIVATING')} translations={t} />}

        {state === 'DEACTIVATING' && (
          <PinPad 
            correctPin={config.pin} 
            language={config.language}
            onSuccess={() => { setState('PROTECTED'); setActiveTab('PROTECTED'); }} 
            onCancel={() => setState('EMERGENCY')}
            translations={t}
          />
        )}

        {config.pin && activeTab === 'HISTORY' && state !== 'EMERGENCY' && state !== 'DEACTIVATING' && (
          <HistoryView logs={logs} language={config.language} onClose={() => setActiveTab('PROTECTED')} translations={t} />
        )}
      </div>

      {showNav && (
        <nav className="absolute bottom-0 left-0 right-0 bg-neutral-900/80 backdrop-blur-xl border-t border-white/5 p-4 flex justify-around items-center z-20 pb-8">
          <button onClick={() => { setActiveTab('PROTECTED'); setState('PROTECTED'); }} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'PROTECTED' ? 'text-red-500 scale-110' : 'text-neutral-500'}`}>
            <Shield size={24} fill={activeTab === 'PROTECTED' ? 'currentColor' : 'none'} />
            <span className="text-[10px] font-black uppercase tracking-widest">{t.active}</span>
          </button>
          <button onClick={() => setActiveTab('HISTORY')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'HISTORY' ? 'text-red-500 scale-110' : 'text-neutral-500'}`}>
            <History size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">{t.logs}</span>
          </button>
          <button onClick={() => setActiveTab('SETUP')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'SETUP' ? 'text-red-500 scale-110' : 'text-neutral-500'}`}>
            <Settings size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest">{t.settings}</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default App;
