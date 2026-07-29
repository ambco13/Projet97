
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
          aria-expanded={showLangMenu}
          className="p97-language-trigger flex items-center gap-2 px-3 py-2 rounded-full transition-all active:scale-95"
        >
          <Globe size={14} />
          <span className="text-xs font-medium uppercase tracking-wide">
            {(languages[language] || languages.fr).shortName}
          </span>
          <ChevronDown size={12} className={`transition-transform duration-300 ${showLangMenu ? 'rotate-180' : ''}`} />
        </button>

        {showLangMenu && (
          <div className={`p97-language-menu absolute top-full mt-2 p-1.5 min-w-[180px] animate-in fade-in slide-in-from-top-1 duration-200 ${isRtl ? 'left-0' : 'right-0'}`}>
            {Object.entries(languages).map(([code, meta]) => {
              const isActive = language === code;
              return (
                <button
                  key={code}
                  onClick={() => selectLanguage(code)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`p97-language-item w-full flex items-center gap-3 px-3 py-2.5 transition-all ${isActive ? 'p97-language-item-active' : 'hover:bg-white/5'}`}
                  style={{ color: isActive ? 'var(--p97-accent)' : 'var(--p97-text-2)' }}
                >
                  <span className="text-base leading-none">{meta.flag}</span>
                  <span className="text-[13px] font-medium">{meta.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!hideHeader ? (
        <div className="flex justify-between items-start mb-10">
          <div className="flex items-center gap-4">
            <div className="p97-icon-tile p-3.5">
              <ShieldCheck size={28} style={{ color: 'var(--p97-accent)' }} strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="p97-luxe-title text-2xl">{t.appTitle}</h1>
              <p className="p97-eyebrow mt-1">{t.guardianProtocol}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-10 relative min-h-14">
          <div>
            <h2 className="p97-luxe-title text-2xl">{t.settings}</h2>
            <p className="p97-eyebrow mt-1">{t.protocolEdition}</p>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              aria-label={t.settings}
              className={`absolute top-0 ${isRtl ? 'left-0' : 'right-0'} p-3 p97-luxe-card transition-colors`}
              style={{ color: 'var(--p97-text-2)' }}
            >
              {isRtl ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}
            </button>
          )}
        </div>
      )}

      <div className="space-y-6">
        <div className="p97-luxe-card p97-section flex items-center justify-between">
           <div className="flex items-center gap-3">
             <Cloud
               size={20}
               style={{ color: dbState === 'CONNECTED' ? 'var(--p97-safe)' : 'var(--p97-text-3)' }}
               className={dbState === 'CONNECTED' ? '' : 'animate-pulse'}
             />
             <div>
               <p className="p97-eyebrow">{t.cloudStatus}</p>
               <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--p97-text)' }}>
                 {dbState === 'CONNECTED' ? t.cloudConnected : t.cloudSyncing}
               </p>
             </div>
           </div>
           {dbState === 'CONNECTED' && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--p97-safe)' }} />}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {([
            { key: 'gps', state: geoState, Icon: MapPin, label: 'GPS', test: testGeo },
            { key: 'mic', state: micState, Icon: Mic, label: 'Micro', test: testMic },
          ]).map(({ key, state, Icon, label, test }) => {
            const ok = state === 'SUCCESS';
            const failed = state === 'ERROR';
            return (
              <section
                key={key}
                className="p97-luxe-card p97-section flex flex-col gap-3"
                style={ok ? { borderColor: 'var(--p97-safe-line)' } : failed ? { borderColor: 'var(--p97-accent-line)' } : undefined}
              >
                <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--p97-text)' }}>
                  <Icon size={15} style={{ color: ok ? 'var(--p97-safe)' : failed ? 'var(--p97-accent)' : 'var(--p97-text-3)' }} />
                  {label}
                </h2>
                <button
                  onClick={test}
                  className="w-full py-2.5 rounded-[var(--p97-r-sm)] text-[13px] font-medium transition-colors"
                  style={ok
                    ? { background: 'var(--p97-safe-soft)', color: 'var(--p97-safe)', border: '1px solid var(--p97-safe-line)' }
                    : { background: 'var(--p97-surface-2)', color: 'var(--p97-text)', border: '1px solid var(--p97-line)' }}
                >
                  {ok ? 'Actif' : 'Activer'}
                </button>
              </section>
            );
          })}
        </div>

        <section className="p97-luxe-card p97-section">
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: 'var(--p97-text)' }}>
            <Key size={16} style={{ color: 'var(--p97-text-3)' }} />{t.pinCode}
          </h2>
          <input type="password" maxLength={4} inputMode="numeric" placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="p97-field p-4 text-center text-2xl font-semibold tracking-[0.6em]" />
        </section>

        <section className="p97-luxe-card p97-section">
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: 'var(--p97-text)' }}>
            <UserPlus size={16} style={{ color: 'var(--p97-text-3)' }} />{t.identityLabel}
          </h2>
          <input type="text" placeholder={t.identityPlaceholder} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="p97-field p-3.5 text-sm mb-3" />
          <input type="tel" placeholder={t.ownerPhonePlaceholder || '+33...'} value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} className="p97-field p-3.5 text-sm" />
          <p className="text-xs leading-relaxed mt-3" style={{ color: 'var(--p97-text-3)' }}>{t.ownerPhoneHint || 'Ce numéro permet à vos contacts de recevoir le HELP même hors du rayon 1 km.'}</p>
        </section>

        <section className="p97-luxe-card p97-section">
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: 'var(--p97-text)' }}>
            <UserPlus size={16} style={{ color: 'var(--p97-text-3)' }} />{t.emergencyContacts}
          </h2>
          <div className="space-y-2 mb-5">
            {contacts.map(c => (
              <div key={c.id} className="p97-mini-card flex items-center justify-between p-3.5">
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--p97-text)' }}>{c.name}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--p97-text-3)' }}>{c.phone}</p>
                </div>
                <button
                  onClick={() => setContacts(contacts.filter(x => x.id !== c.id))}
                  aria-label={`${t.delete || 'Supprimer'} ${c.name}`}
                  className="p-2 shrink-0 transition-colors hover:text-[var(--p97-accent)]"
                  style={{ color: 'var(--p97-text-3)' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder={t.contactNamePlaceholder} value={newName} onChange={(e) => setNewName(e.target.value)} className="p97-field p-3 text-sm" />
              <input type="tel" placeholder={t.contactPhonePlaceholder} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="p97-field p-3 text-sm" />
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--p97-text-3)' }}>{t.contactDeliveryHint}</p>
            <button onClick={addContact} className="w-full p97-mini-card py-3 text-[13px] font-medium transition-all active:scale-[0.99]" style={{ color: 'var(--p97-text)' }}>{t.add}</button>
          </div>
        </section>

        <button disabled={!isReady} onClick={() => onComplete(ownerName.trim(), ownerPhone.trim(), contacts, pin, guardianNetwork, language)} className="w-full p97-sos-luxe py-4 text-sm font-semibold transition-all active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed">
          {initialConfig?.pin ? t.saveChanges : t.activateProtection}
        </button>
      </div>
    </div>
  );
};

export default SetupView;
