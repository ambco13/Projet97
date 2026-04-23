
import React, { useEffect, useState, useRef } from 'react';
import { Lock, Volume2, Send } from 'lucide-react';
import { Contact } from '../types';
import MapView from './MapView';

interface Props {
  contacts: Contact[];
  language: string;
  onDeactivate: () => void;
  translations: any;
}

const EmergencyView: React.FC<Props> = ({ contacts, language, onDeactivate, translations: t }) => {
  const [seconds, setSeconds] = useState(0);
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);
  const [nearbyGuardians, setNearbyGuardians] = useState<number | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const autoOpenedRef = useRef(false);
  const nearbyAlertSentRef = useRef(false);

  const getOrCreateDeviceId = () => {
    const key = 'p97_device_id';
    let deviceId = localStorage.getItem(key);
    if (!deviceId) {
      const uuid = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      deviceId = `p97_${uuid}`;
      localStorage.setItem(key, deviceId);
    }
    return deviceId;
  };

  const startTracking = () => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.error(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const shareLocation = async () => {
    if (!coords) return;
    const url = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
    const message = `${t.sosActive}! Location: ${url}`;
    sendSMSFallback(message);
  };

  const sendSMSFallback = (message: string) => {
    if (!contacts.length) return;
    const phones = contacts.map(c => c.phone).join(',');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const smsUrl = isIOS ? `sms:${phones}&body=${encodeURIComponent(message)}` : `sms:${phones}?body=${encodeURIComponent(message)}`;
    window.location.href = smsUrl;
  };

  const sendNearbyAlert = async (position: { lat: number; lng: number }) => {
    const payload = {
      action: 'alert',
      radiusKm: 1,
      deviceId: getOrCreateDeviceId(),
      lat: position.lat,
      lng: position.lng,
    };

    const endpoints = ['/.netlify/functions/presence', '/api/presence'];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) continue;
        const data = await response.json();
        const count = Number.isFinite(Number(data.nearbyCount)) ? Number(data.nearbyCount) : 0;
        setNearbyGuardians(Math.max(0, count));
        return;
      } catch {
        // Try next endpoint
      }
    }

    setNearbyGuardians(0);
  };

  useEffect(() => {
    if (!coords || autoOpenedRef.current || contacts.length === 0) return;
    autoOpenedRef.current = true;
    const url = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
    const message = `${t.sosActive}! Location: ${url}`;
    sendSMSFallback(message);
  }, [coords, contacts.length, t.sosActive]);

  useEffect(() => {
    if (!coords || nearbyAlertSentRef.current) return;
    nearbyAlertSentRef.current = true;
    sendNearbyAlert(coords);
  }, [coords]);

  useEffect(() => {
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    const speakDeterrence = () => {
      const msg = new SpeechSynthesisUtterance(t.voiceMsg);
      msg.lang = language || 'fr-FR';
      msg.onend = () => { voiceTimerRef.current = window.setTimeout(speakDeterrence, 6000); };
      window.speechSynthesis.speak(msg);
    };
    speakDeterrence();
    startTracking();
    return () => {
      clearInterval(timer);
      if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      window.speechSynthesis.cancel();
    };
  }, [contacts, language]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0000] flex flex-col p-8 overflow-hidden select-none">
      <div className="absolute inset-0 bg-red-600/10 emergency-pulse pointer-events-none"></div>
      <div className="relative z-10 flex flex-col h-full">
        <header className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-red-500 font-black tracking-[0.3em] text-[10px] uppercase">{t.sosActive}</span>
          </div>
          <div className="text-white/40 font-mono text-xs">{seconds}s</div>
        </header>

        <div className="flex-1 flex flex-col items-center overflow-y-auto custom-scrollbar pb-4">
          <div className="w-full h-64 bg-neutral-900 rounded-[2rem] border border-white/10 mb-6 overflow-hidden relative shadow-2xl shrink-0">
            {coords ? <MapView lat={coords.lat} lng={coords.lng} zoom={17} /> : <div className="w-full h-full flex items-center justify-center bg-neutral-950 text-[10px] font-black uppercase text-neutral-500">GPS...</div>}
          </div>

          <button disabled={!coords} onClick={shareLocation} className="w-full bg-red-600 text-white font-black py-6 rounded-[1.5rem] shadow-[0_0_30px_rgba(239,68,68,0.4)] flex flex-col items-center justify-center gap-0.5 mb-6 animate-bounce disabled:opacity-20 shrink-0">
            <div className="flex items-center gap-2"><Send size={20} /><span className="uppercase tracking-[0.2em] text-[12px]">{t.alertContacts}</span></div>
            <span className="text-[9px] opacity-60 uppercase font-black">{t.sendingLocation}</span>
          </button>

          <div className="w-full bg-white/5 p-5 rounded-[1.5rem] border border-white/5 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <Volume2 className="text-white/60" size={16} />
              <p className="text-white/60 font-black text-[10px] uppercase tracking-widest">{t.voiceDeterrence}</p>
            </div>
            <p className="text-neutral-400 text-[11px] font-medium leading-relaxed italic italic-red-selection">"{t.voiceMsg}"</p>
            {nearbyGuardians !== null && (
              <p className="text-[10px] text-blue-300 font-semibold mt-3">
                {nearbyGuardians} {t.nearbyGuardians}
              </p>
            )}
          </div>
        </div>

        <div className="mt-auto pt-4 shrink-0">
          <button onClick={onDeactivate} className="w-full bg-neutral-900/90 text-neutral-200 font-black py-5 rounded-[1.5rem] border border-white/5 flex items-center justify-center gap-3 transition-all active:scale-[0.98]">
            <Lock size={18} className="text-neutral-500" />
            {t.deactivate}
          </button>
        </div>
      </div>
      <style>{`
        .italic-red-selection::selection { background: #dc2626; color: white; }
      `}</style>
    </div>
  );
};

export default EmergencyView;
