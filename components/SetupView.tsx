
import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, ShieldCheck, Key, MapPin, CheckCircle2, ArrowLeft, Globe, ChevronDown, Mic, AlertCircle, Cloud, Bot, Sparkles } from 'lucide-react';
import { Contact, AppConfig } from '../types';
import { languages } from '../translations';

interface Props {
  onComplete: (contacts: Contact[], pin: string, guardianNetwork: boolean, language: string, aiGuardian: boolean) => void;
  onCancel?: () => void;
  initialConfig?: AppConfig;
  hideHeader?: boolean;
  translations: any;
}

const SetupView: React.FC<Props> = ({ onComplete, onCancel, initialConfig, hideHeader = false, translations: t }) => {
  const [contacts, setContacts] = useState<Contact[]>(initialConfig?.contacts || []);
  const [pin, setPin] = useState(initialConfig?.pin || '');
  const [guardianNetwork, setGuardianNetwork] = useState(initialConfig?.guardianNetwork ?? true);
  const [aiGuardian, setAiGuardian] = useState(initialConfig?.aiGuardian ?? true);
  const [language, setLanguage] = useState<string>(initialConfig?.language || 'fr');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [geoState, setGeoState] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>(initialConfig?.pin ? 'SUCCESS' : 'IDLE');
  const [micState, setMicState] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>(initialConfig?.pin ? 'SUCCESS' : 'IDLE');
  const [dbState, setDbState] = useState<'OFFLINE' | 'SYNCING' | 'CONNECTED'>('SYNCING');
  const [showLangMenu, setShowLangMenu] = useState(false);

  useEffect(() => {
    if (!initialConfig?.pin) {
      testGeo();
      testMic();
    }
    
    // Simulation du check DB pour montrer le "match"
    setTimeout(() => {
      setDbState('CONNECTED');
    }, 2000);
  }, []);

  const testGeo = () => {
    setGeoState('LOADING');
    navigator.geolocation.getCurrentPosition(
      () => setGeoState('SUCCESS'),
      () => setGeoState('ERROR'),
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const testMic = async () => {
    setMicState('LOADING');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicState('SUCCESS');
    } catch (err: any) {
      setMicState('ERROR');
    }
  };

  const addContact = () => {
    if (newName && newPhone) {
      setContacts([...contacts, { id: Date.now().toString(), name: newName, phone: newPhone, role: 'Confiance' }]);
      setNewName('');
      setNewPhone('');
    }
  };

  const isReady = contacts.length > 0 && pin.length === 4 && geoState === 'SUCCESS' && micState === 'SUCCESS';

  return (
    <div className="p-8 pb-32 animate-in fade-in slide-in-from-bottom-6 duration-700 relative min-h-full">
      <div className="absolute top-6 right-6 z-50">
        <button 
          onClick={() => setShowLangMenu(!showLangMenu)}
          className="flex items-center gap-2 bg-neutral-900/60 hover:bg-neutral-800/80 backdrop-blur-xl border border-white/10 px-3 py-2 rounded-2xl text-neutral-400 hover:text-white transition-all active:scale-95 shadow-xl"
        >
          <Globe size={14} className="opacity-70" />
          <span className="text-[10px] font-black tracking-widest uppercase">
            {(languages[language] || languages.fr).shortName}
          </span>
          <ChevronDown size={12} className={`transition-transform duration-300 ${showLangMenu ? 'rotate-180' : ''}`} />
        </button>

        {showLangMenu && (
          <div className="absolute top-full right-0 mt-4 bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-[1.5rem] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.6)] min-w-[160px] animate-in fade-in slide-in-from-top-2 duration-300">
            {Object.entries(languages).map(([code, meta]) => (
              <button
                key={code}
                onClick={() => {
                  setLanguage(code);
                  setShowLangMenu(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all mb-1 last:mb-0 ${
                  language === code 
                    ? 'bg-red-600/20 text-red-500 border border-red-500/20 shadow-inner' 
                    : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-lg leading-none">{meta.flag}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{meta.name}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {!hideHeader ? (
        <div className="flex justify-between items-start mb-10">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-gradient-to-br from-red-600 to-red-800 rounded-2xl shadow-2xl shadow-red-950/40">
              <ShieldCheck className="text-white" size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tighter">{t.appTitle}</h1>
              <p className="text-red-500 font-black text-[10px] uppercase tracking-[0.3em]">{t.guardianProtocol}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tighter">{t.settings}</h2>
            <p className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em]">{t.protocolEdition}</p>
          </div>
          {onCancel && (
            <button onClick={onCancel} className="p-3 bg-neutral-900 rounded-2xl text-neutral-400 hover:text-white transition-colors mr-14">
              <ArrowLeft size={20} />
            </button>
          )}
        </div>
      )}

      <div className="space-y-6">
        {/* Cloud Status */}
        <div className={`bg-neutral-900/40 rounded-3xl p-4 border flex items-center justify-between transition-colors ${dbState === 'CONNECTED' ? 'border-blue-500/20' : 'border-white/5'}`}>
           <div className="flex items-center gap-3">
             <Cloud className={dbState === 'CONNECTED' ? 'text-blue-500' : 'text-neutral-500 animate-pulse'} size={20} />
             <div>
               <p className="text-[9px] font-black text-neutral-500 uppercase">{t.cloudStatus}</p>
               <p className="text-white text-[11px] font-bold">{dbState === 'CONNECTED' ? t.cloudConnected : t.cloudSyncing}</p>
             </div>
           </div>
           {dbState === 'CONNECTED' && <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <section className={`rounded-3xl p-5 border transition-all duration-500 flex flex-col items-center ${
            geoState === 'SUCCESS' ? 'bg-green-500/5 border-green-500/20' : geoState === 'ERROR' ? 'bg-red-500/10 border-red-500/30' : 'bg-neutral-900/40 border-white/5'
          }`}>
            <div className="flex justify-between w-full items-start mb-3">
              <h2 className="text-[10px] font-black text-white uppercase flex items-center gap-2">
                <MapPin size={14} className={geoState === 'SUCCESS' ? 'text-green-500' : 'text-red-500'} />
                GPS
              </h2>
            </div>
            <button onClick={testGeo} className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest ${
              geoState === 'SUCCESS' ? 'bg-green-500/20 text-green-500 border border-green-500/20' : 'bg-white/5 text-white'
            }`}>
              {geoState === 'SUCCESS' ? 'OK' : 'ACTIVER'}
            </button>
          </section>

          <section className={`rounded-3xl p-5 border transition-all duration-500 flex flex-col items-center ${
            micState === 'SUCCESS' ? 'bg-green-500/5 border-green-500/20' : micState === 'ERROR' ? 'bg-red-500/10 border-red-500/30' : 'bg-neutral-900/40 border-white/5'
          }`}>
            <div className="flex justify-between w-full items-start mb-3">
              <h2 className="text-[10px] font-black text-white uppercase flex items-center gap-2">
                <Mic size={14} className={micState === 'SUCCESS' ? 'text-green-500' : 'text-red-500'} />
                MICRO
              </h2>
            </div>
            <button onClick={testMic} className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest ${
              micState === 'SUCCESS' ? 'bg-green-500/20 text-green-500 border border-green-500/20' : 'bg-white/5 text-white'
            }`}>
              {micState === 'SUCCESS' ? 'OK' : 'ACTIVER'}
            </button>
          </section>
        </div>

        {/* AI Guardian Toggle */}
        <section className="bg-neutral-900/40 rounded-3xl p-6 border border-white/5">
           <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                 <Bot size={18} className="text-blue-500" />
                 <h2 className="text-sm font-black text-white uppercase">{t.aiGuardian}</h2>
              </div>
              <button 
                onClick={() => setAiGuardian(!aiGuardian)}
                className={`w-12 h-6 rounded-full transition-all relative ${aiGuardian ? 'bg-blue-600' : 'bg-neutral-800'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${aiGuardian ? 'left-7' : 'left-1'}`}></div>
              </button>
           </div>
           <p className="text-[10px] text-neutral-500 leading-relaxed font-medium">
             {t.aiGuardianDesc} <Sparkles size={10} className="inline ml-1 text-blue-400" />
           </p>
        </section>

        <section className="bg-neutral-900/40 rounded-3xl p-6 border border-white/5">
          <h2 className="text-sm font-black text-white mb-4 uppercase flex items-center gap-2"><Key size={16} className="text-red-500" />{t.pinCode}</h2>
          <input type="password" maxLength={4} inputMode="numeric" placeholder="****" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-neutral-950 border border-white/5 rounded-2xl p-4 text-center text-3xl font-black tracking-[1em] text-white focus:ring-2 focus:ring-red-500 outline-none transition-all" />
        </section>

        <section className="bg-neutral-900/40 rounded-3xl p-6 border border-white/5">
          <h2 className="text-sm font-black text-white mb-4 uppercase flex items-center gap-2"><UserPlus size={16} className="text-red-500" />{t.emergencyContacts}</h2>
          <div className="space-y-3 mb-6">
            {contacts.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-neutral-950 p-4 rounded-2xl border border-white/5">
                <div className="text-left px-2">
                  <p className="font-bold text-white text-sm">{c.name}</p>
                  <p className="text-[10px] font-mono text-neutral-500">{c.phone}</p>
                </div>
                <button onClick={() => setContacts(contacts.filter(x => x.id !== c.id))} className="text-neutral-600 hover:text-red-500 p-2"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder="Nom" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-neutral-950 border border-white/5 rounded-xl p-3 text-sm text-white" />
              <input type="tel" placeholder="Mobile" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="bg-neutral-950 border border-white/5 rounded-xl p-3 text-sm text-white" />
            </div>
            <button onClick={addContact} className="w-full bg-white/5 border border-white/10 text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest">{t.add}</button>
          </div>
        </section>

        <button disabled={!isReady} onClick={() => onComplete(contacts, pin, guardianNetwork, language, aiGuardian)} className="w-full bg-red-600 text-white font-black py-5 rounded-[2rem] shadow-2xl transition-all disabled:opacity-20 uppercase tracking-widest text-sm">
          {initialConfig?.pin ? t.saveChanges : t.activateProtection}
        </button>
      </div>
    </div>
  );
};

export default SetupView;
