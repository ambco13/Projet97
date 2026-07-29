
import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, ShieldCheck, Key, MapPin, ArrowLeft, ArrowRight, Globe, ChevronDown, Mic, Cloud } from 'lucide-react';
import { Contact, AppConfig } from '../types';
import { languages } from '../translations';

interface Props {
  onComplete: (ownerName: string, ownerPhone: string, contacts: Contact[], pin: string, guardianNetwork: boolean, language: string) => void;
  onLanguageChange?: (language: string) => void;
  onCancel?: () => void;
  initialConfig?: AppConfig;
  hideHeader?: boolean;
  translations: any;
}

const SetupView: React.FC<Props> = ({ onComplete, onLanguageChange, onCancel, initialConfig, hideHeader = false, translations: t }) => {
  const [contacts, setContacts] = useState<Contact[]>(initialConfig?.contacts || []);
  const [ownerName, setOwnerName] = useState(initialConfig?.ownerName || '');
  const [ownerPhone, setOwnerPhone] = useState(initialConfig?.ownerPhone || '');
  const [pin, setPin] = useState(initialConfig?.pin || '');
  const [guardianNetwork, setGuardianNetwork] = useState(initialConfig?.guardianNetwork ?? true);
  const [language, setLanguage] = useState<string>(initialConfig?.language || 'fr');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [geoState, setGeoState] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>(initialConfig?.pin ? 'SUCCESS' : 'IDLE');
  const [micState, setMicState] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>(initialConfig?.pin ? 'SUCCESS' : 'IDLE');
  const [dbState, setDbState] = useState<'OFFLINE' | 'SYNCING' | 'CONNECTED'>('SYNCING');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const isRtl = (languages[language] || languages.fr).dir === 'rtl';

  useEffect(() => {
    if (!initialConfig?.pin) {
      testGeo();
      testMic();
    }
    
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
    const normalizedPhone = newPhone.trim().replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '');
    if (newName.trim() && normalizedPhone) {
      setContacts([...contacts, { id: Date.now().toString(), name: newName.trim(), phone: normalizedPhone, role: 'Confiance' }]);
      setNewName('');
      setNewPhone('');
    }
  };

  const selectLanguage = (code: string) => {
    setLanguage(code);
    onLanguageChange?.(code);
    setShowLangMenu(false);
  };

  const isReady = ownerName.trim().length > 0 && ownerPhone.trim().length > 0 && contacts.length > 0 && pin.length === 4 && geoState === 'SUCCESS' && micState === 'SUCCESS';

  return (
    <div className="p-6 sm:p-8 pb-32 animate-in fade-in slide-in-from-bottom-6 duration-700 relative min-h-full">
      <div className={`absolute top-20 z-50 ${isRtl ? 'left-6' : 'right-6'}`}>
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
          <div className={`absolute top-full mt-4 bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-[1.5rem] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.6)] min-w-[160px] animate-in fade-in slide-in-from-top-2 duration-300 ${isRtl ? 'left-0' : 'right-0'}`}>
            {Object.entries(languages).map(([code, meta]) => (
              <button
                key={code}
                onClick={() => selectLanguage(code)}
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
              <h1 className="p97-luxe-title text-3xl font-black tracking-tighter">{t.appTitle}</h1>
              <p className="text-red-500 font-black text-[10px] uppercase tracking-[0.3em]">{t.guardianProtocol}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-10 relative min-h-14">
          <div>
            <h2 className="p97-luxe-title text-3xl font-black tracking-tighter">{t.settings}</h2>
            <p className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em]">{t.protocolEdition}</p>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className={`absolute top-0 ${isRtl ? 'left-0' : 'right-0'} p-3 p97-luxe-card rounded-2xl text-neutral-400 hover:text-white transition-colors`}
            >
              {isRtl ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}
            </button>
          )}
        </div>
      )}

      <div className="space-y-6">
        <div className={`p97-luxe-card p97-section flex items-center justify-between transition-all ${dbState === 'CONNECTED' ? 'border-blue-500/30' : 'border-white/10'}`}>
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
          <section className={`p97-section border transition-all duration-500 flex flex-col items-center ${
            geoState === 'SUCCESS' ? 'bg-green-500/5 border-green-500/20' : geoState === 'ERROR' ? 'bg-red-500/10 border-red-500/30' : 'p97-luxe-card'
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

          <section className={`p97-section border transition-all duration-500 flex flex-col items-center ${
            micState === 'SUCCESS' ? 'bg-green-500/5 border-green-500/20' : micState === 'ERROR' ? 'bg-red-500/10 border-red-500/30' : 'p97-luxe-card'
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

        <section className="p97-luxe-card p97-section">
          <h2 className="text-sm font-black text-white mb-4 uppercase flex items-center gap-2"><Key size={16} className="text-red-500" />{t.pinCode}</h2>
          <input type="password" maxLength={4} inputMode="numeric" placeholder="****" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="p97-field p-4 text-center text-3xl font-black tracking-[1em]" />
        </section>

        <section className="p97-luxe-card p97-section">
          <h2 className="text-sm font-black text-white mb-4 uppercase flex items-center gap-2"><UserPlus size={16} className="text-red-500" />{t.identityLabel}</h2>
          <input type="text" placeholder={t.identityPlaceholder} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="p97-field p-4 text-sm mb-3" />
          <input type="tel" placeholder={t.ownerPhonePlaceholder || '+33...'} value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} className="p97-field p-4 text-sm" />
          <p className="text-[10px] leading-relaxed text-neutral-500 font-semibold mt-3">{t.ownerPhoneHint || 'Ce numéro permet à vos contacts de recevoir le HELP même hors du rayon 1 km.'}</p>
        </section>

        <section className="p97-luxe-card p97-section">
          <h2 className="text-sm font-black text-white mb-4 uppercase flex items-center gap-2"><UserPlus size={16} className="text-red-500" />{t.emergencyContacts}</h2>
          <div className="space-y-3 mb-6">
            {contacts.map(c => (
              <div key={c.id} className="p97-mini-card flex items-center justify-between p-4 rounded-2xl transition-all hover:border-red-400/30">
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
              <input type="text" placeholder={t.contactNamePlaceholder} value={newName} onChange={(e) => setNewName(e.target.value)} className="p97-field p-3 text-sm" />
              <input type="tel" placeholder={t.contactPhonePlaceholder} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="p97-field p-3 text-sm" />
            </div>
            <p className="text-[10px] leading-relaxed text-neutral-500 font-semibold">{t.contactDeliveryHint}</p>
            <button onClick={addContact} className="w-full p97-mini-card text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all active:scale-[0.98]">{t.add}</button>
          </div>
        </section>

        <button disabled={!isReady} onClick={() => onComplete(ownerName.trim(), ownerPhone.trim(), contacts, pin, guardianNetwork, language)} className="w-full p97-sos-luxe text-white font-black py-5 rounded-[2rem] shadow-2xl transition-all active:scale-[0.98] disabled:opacity-20 uppercase tracking-widest text-sm">
          {initialConfig?.pin ? t.saveChanges : t.activateProtection}
        </button>
      </div>
    </div>
  );
};

export default SetupView;
