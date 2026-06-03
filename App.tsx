
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, History, Settings } from 'lucide-react';
import { AppState, Contact, EmergencyLog, AppConfig } from './types';
import SetupView from './components/SetupView';
import ProtectedView from './components/ProtectedView';
import EmergencyView from './components/EmergencyView';
import HistoryView from './components/HistoryView';
import PinPad from './components/PinPad';
import { translations, languages } from './translations';
import { PRESENCE_ENDPOINTS } from './apiEndpoints';

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
};

const SHAKE_THRESHOLD = 28; // Secouement volontaire (très intense)
const BACKGROUND_SHAKE_THRESHOLD = 40; // Hors focus: secouement hyper intense uniquement
const TAB_ORDER: Array<'PROTECTED' | 'HISTORY' | 'SETUP'> = ['PROTECTED', 'HISTORY', 'SETUP'];
const VOICE_TRIGGER_COMMANDS = [
  'alert',
  'alerte',
  'alerta',
  'alarma',
  'тревога',
  'انذار',
  'نجدة',
  'התראה',
  'התרעה',
  'אזעקה',
  'אלרט',
];

const VOICE_TRIGGER_NUMBERS = [
  '97',
  '9 7',
  'nine seven',
  'ninety seven',
  'neuf sept',
  'quatre vingt dix sept',
  'quatre vingts dix sept',
  'תשעים ושבע',
  'תשעים ושבעה',
  'תשעים שבע',
  'תשעים שבעה',
  'תשע שבע',
  'سبعة وتسعون',
  'سبعه وتسعون',
  'سبعة و تسعون',
  'سبعه و تسعون',
  'سبعة تسعون',
  'سبعه تسعون',
  'تسعة سبعة',
  'تسعه سبعه',
];

const normalizeVoiceTranscript = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u0591-\u05c7]/g, '')
  .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
  .replace(/[إأآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/[’'`]/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/(\p{L})(\p{N})/gu, '$1 $2')
  .replace(/(\p{N})(\p{L})/gu, '$1 $2')
  .replace(/\s+/g, ' ')
  .trim();

const includesVoiceToken = (transcript: string, token: string) => {
  const normalizedToken = normalizeVoiceTranscript(token);
  return new RegExp(`(^|\\s)${normalizedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'u').test(transcript);
};

const shouldTriggerVoiceCommand = (transcript: string) => {
  const normalizedTranscript = normalizeVoiceTranscript(transcript);
  const hasCommand = VOICE_TRIGGER_COMMANDS.some((command) => includesVoiceToken(normalizedTranscript, command));
  const hasProjectNumber = VOICE_TRIGGER_NUMBERS.some((number) => includesVoiceToken(normalizedTranscript, number));
  return hasCommand && hasProjectNumber;
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>('SETUP');
  const stateRef = useRef<AppState>('SETUP');
  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('p97_config');
    if (!saved) return { ownerName: '', pin: '', contacts: [], guardianNetwork: true, language: 'fr', protectionEnabled: true };
    const parsed = JSON.parse(saved);
    return {
      ownerName: parsed.ownerName || '',
      ...parsed,
      protectionEnabled: parsed.protectionEnabled !== false,
    };
  });
  const [logs, setLogs] = useState<EmergencyLog[]>(() => {
    const saved = localStorage.getItem('p97_logs');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeTab, setActiveTab] = useState<'PROTECTED' | 'HISTORY' | 'SETUP'>('PROTECTED');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const restartListenTimeoutRef = useRef<number | null>(null);
  const lastShakeTime = useRef<number>(0);
  const strongShakeCountRef = useRef<number>(0);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);

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
    if (stateRef.current === 'EMERGENCY' || stateRef.current === 'DEACTIVATING' || !config.protectionEnabled) return;
    
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        addLog({
          type: 'TRIGGER',
          detail: reason,
          coordinates: { lat: pos.coords.latitude, lng: pos.coords.longitude }
        });
      },
      () => {
        addLog({ type: 'TRIGGER', detail: `${reason} (No GPS)` });
      },
      GEO_OPTIONS
    );
    setState('EMERGENCY');
  }, [addLog, config.protectionEnabled]);

  const getOrCreateDeviceId = useCallback(() => {
    const key = 'p97_device_id';
    let deviceId = localStorage.getItem(key);
    if (!deviceId) {
      const uuid = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      deviceId = `p97_${uuid}`;
      localStorage.setItem(key, deviceId);
    }
    return deviceId;
  }, []);

  const resolveEmergencyAlert = useCallback(async () => {
    const payload = { action: 'resolve', deviceId: getOrCreateDeviceId() };
    for (const endpoint of PRESENCE_ENDPOINTS) {
      try {
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return;
      } catch {
        // try next endpoint
      }
    }
  }, [getOrCreateDeviceId]);

  // Détection de secousses
  useEffect(() => {
    const handleMotion = (event: DeviceMotionEvent) => {
      if (stateRef.current !== 'PROTECTED' || !config.protectionEnabled) return;
      
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;

      const totalAcc = Math.sqrt((acc.x || 0)**2 + (acc.y || 0)**2 + (acc.z || 0)**2);
      
      const isVisible = document.visibilityState === 'visible';
      const activeThreshold = isVisible ? SHAKE_THRESHOLD : BACKGROUND_SHAKE_THRESHOLD;
      if (totalAcc > activeThreshold) {
        const now = Date.now();
        const withinBurst = now - lastShakeTime.current < 1200;
        strongShakeCountRef.current = withinBurst ? strongShakeCountRef.current + 1 : 1;
        lastShakeTime.current = now;

        if (strongShakeCountRef.current >= 2) {
          strongShakeCountRef.current = 0;
          triggerEmergency('SHAKE DETECTED');
        }
      }
    };

    if (state === 'PROTECTED' && config.protectionEnabled) {
      window.addEventListener('devicemotion', handleMotion);
    }
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [state, config.protectionEnabled, triggerEmergency]);

  const stopListening = useCallback(() => {
    if (restartListenTimeoutRef.current) {
      clearTimeout(restartListenTimeoutRef.current);
      restartListenTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (document.visibilityState !== 'visible') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = langMeta.locale || 'fr-FR';
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const result = event.results[event.results.length - 1][0].transcript;
        const shouldTrigger = shouldTriggerVoiceCommand(result);
        if (shouldTrigger) {
          triggerEmergency('VOICE COMMAND');
        }
      };
      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        if (stateRef.current === 'PROTECTED' && document.visibilityState === 'visible') {
          restartListenTimeoutRef.current = window.setTimeout(() => {
            if (stateRef.current === 'PROTECTED' && document.visibilityState === 'visible') {
              startListening();
            }
          }, 1800);
        }
      };
      recognition.onerror = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };
      try { recognition.start(); recognitionRef.current = recognition; } catch (e) { setIsListening(false); }
    }
  }, [triggerEmergency, langMeta.locale]);

  useEffect(() => {
    const shouldListen = state === 'PROTECTED' && activeTab === 'PROTECTED' && config.protectionEnabled;
    if (shouldListen) {
      startListening();
    } else {
      stopListening();
    }
    return () => stopListening();
  }, [state, activeTab, config.protectionEnabled, startListening, stopListening]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && stateRef.current === 'PROTECTED' && activeTab === 'PROTECTED' && config.protectionEnabled) {
        startListening();
      } else {
        stopListening();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', stopListening);
    window.addEventListener('focus', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', stopListening);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [activeTab, config.protectionEnabled, startListening, stopListening]);


  const navigateBySwipe = useCallback((direction: 'left' | 'right') => {
    if (!config.pin || state === 'EMERGENCY' || state === 'DEACTIVATING') return;

    const currentIndex = TAB_ORDER.indexOf(activeTab);
    if (currentIndex === -1) return;

    const nextIndex = direction === 'left'
      ? Math.min(currentIndex + 1, TAB_ORDER.length - 1)
      : Math.max(currentIndex - 1, 0);

    if (nextIndex === currentIndex) return;

    const nextTab = TAB_ORDER[nextIndex];
    setActiveTab(nextTab);
    if (nextTab === 'PROTECTED') {
      setState('PROTECTED');
    }
  }, [activeTab, config.pin, state]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    swipeStartX.current = touch.clientX;
    swipeStartY.current = touch.clientY;
  }, []);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (swipeStartX.current === null || swipeStartY.current === null) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - swipeStartX.current;
    const deltaY = touch.clientY - swipeStartY.current;
    const minSwipeDistance = 60;

    swipeStartX.current = null;
    swipeStartY.current = null;

    if (Math.abs(deltaX) < minSwipeDistance || Math.abs(deltaX) < Math.abs(deltaY)) return;

    navigateBySwipe(deltaX < 0 ? 'left' : 'right');
  }, [navigateBySwipe]);

  const handleFinishSetup = (ownerName: string, contacts: Contact[], pin: string, guardianNetwork: boolean, language: string) => {
    // Demande de permission pour les capteurs de mouvement (iOS requis)
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      (DeviceMotionEvent as any).requestPermission()
        .then((permissionState: string) => {
          if (permissionState === 'granted') {
             console.log("Motion access granted");
          }
        })
        .catch(console.error);
    }

    setConfig(prev => ({ ...prev, ownerName, pin, contacts, guardianNetwork, language, protectionEnabled: true }));
    setState('PROTECTED');
    setActiveTab('PROTECTED');
  };

  const handleEmergencyResolved = useCallback(async () => {
    await resolveEmergencyAlert();
    setState('PROTECTED');
    setActiveTab('PROTECTED');
  }, [resolveEmergencyAlert]);

  const showNav = config.pin && state !== 'EMERGENCY' && state !== 'DEACTIVATING';

  return (
    <div 
      className="flex flex-col h-screen max-w-md mx-auto bg-[#050505] shadow-2xl overflow-hidden relative border-x border-neutral-900"
      dir={langMeta.dir}
    >
      <div className={`absolute inset-0 transition-opacity duration-1000 pointer-events-none z-0 ${state === 'EMERGENCY' ? 'opacity-100' : 'opacity-0'}`}>
         <div className="absolute inset-0 bg-red-950/20 emergency-pulse" />
      </div>

      <div
        className="flex-1 relative z-10 overflow-y-auto scroll-smooth"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
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
            protectionEnabled={config.protectionEnabled}
            onTrigger={() => triggerEmergency('MANUAL SOS')} 
            onToggleProtection={() => setConfig(prev => ({ ...prev, protectionEnabled: !prev.protectionEnabled }))}
            onShowHistory={() => setActiveTab('HISTORY')}
            translations={t}
          />
        )}

        {state === 'EMERGENCY' && <EmergencyView ownerName={config.ownerName} contacts={config.contacts} language={config.language} onDeactivate={() => setState('DEACTIVATING')} translations={t} />}

        {state === 'DEACTIVATING' && (
          <PinPad 
            correctPin={config.pin} 
            language={config.language}
            onSuccess={handleEmergencyResolved} 
            onCancel={() => setState('EMERGENCY')}
            translations={t}
          />
        )}

        {config.pin && activeTab === 'HISTORY' && state !== 'EMERGENCY' && state !== 'DEACTIVATING' && (
          <HistoryView logs={logs} language={config.language} onClose={() => setActiveTab('PROTECTED')} translations={t} />
        )}
      </div>

      {showNav && (
        <nav className="absolute bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur-3xl border-t border-white/5 px-4 flex justify-around items-center z-30 h-24 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <button onClick={() => { setActiveTab('PROTECTED'); setState('PROTECTED'); }} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'PROTECTED' ? 'text-red-500 scale-110' : 'text-neutral-500 hover:text-neutral-300'}`}>
            <Shield size={22} fill={activeTab === 'PROTECTED' ? 'currentColor' : 'none'} />
            <span className="text-[9px] font-black uppercase tracking-widest">{t.active}</span>
          </button>
          <button onClick={() => setActiveTab('HISTORY')} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'HISTORY' ? 'text-red-500 scale-110' : 'text-neutral-500 hover:text-neutral-300'}`}>
            <History size={22} />
            <span className="text-[9px] font-black uppercase tracking-widest">{t.logs}</span>
          </button>
          <button onClick={() => setActiveTab('SETUP')} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'SETUP' ? 'text-red-500 scale-110' : 'text-neutral-500 hover:text-neutral-300'}`}>
            <Settings size={22} />
            <span className="text-[9px] font-black uppercase tracking-widest">{t.settings}</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default App;
