
import React, { useEffect, useState, useRef } from 'react';
import { Lock, Volume2, Send } from 'lucide-react';
import { Contact } from '../types';
import { MESSAGE_COMPOSE_ENDPOINTS, PRESENCE_ENDPOINTS } from '../apiEndpoints';
import MapView from './MapView';

interface Props {
  ownerName: string;
  ownerPhone: string;
  contacts: Contact[];
  language: string;
  onDeactivate: () => void;
  translations: any;
}

const EmergencyView: React.FC<Props> = ({ ownerName, ownerPhone, contacts, language, onDeactivate, translations: t }) => {
  const [seconds, setSeconds] = useState(0);
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);
  const [nearbyGuardians, setNearbyGuardians] = useState<number | null>(null);
  const [appMessageStatus, setAppMessageStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const voiceTimerRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const autoOpenedRef = useRef(false);

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

  const buildEmergencyMessage = (position: { lat: number; lng: number }) => {
    const url = `https://www.google.com/maps?q=${position.lat},${position.lng}`;
    const sender = ownerName?.trim() || t.defaultSender;
    return `HELP - ${t.alertPrefix} ${sender}. ${t.sosActive}! Location: ${url}`;
  };

  const showLocalDeliveryNotification = async (message: string) => {
    if (!('Notification' in window)) return;

    try {
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;

      if (permission !== 'granted') return;

      const options: NotificationOptions = {
        body: message,
        tag: 'p97-outgoing-sos',
        requireInteraction: true,
      };

      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(t.appMessageSent || 'Message Projet 97 envoyé', options);
          return;
        }
      }

      new Notification(t.appMessageSent || 'Message Projet 97 envoyé', options);
    } catch {
      // Notifications are best-effort only.
    }
  };

  const prepareNativeSmsCompose = async (message: string) => {
    if (!contacts.length) return null;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const platform = isIOS ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'unknown';

    for (const contact of contacts) {
      for (const endpoint of MESSAGE_COMPOSE_ENDPOINTS) {
        try {
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: contact.phone, text: message, platform }),
          });
          break;
        } catch {
          // try next endpoint
        }
      }
    }

    const phones = contacts.map(c => c.phone).join(',');
    const separator = isIOS ? '&' : '?';
    return `sms:${phones}${separator}body=${encodeURIComponent(message)}`;
  };

  const deliverAppMessageThenOpenSms = async (message: string, position: { lat: number; lng: number }) => {
    if (!contacts.length) return;

    setAppMessageStatus('sending');
    const nearbyCount = await sendNearbyAlert(position, message);
    setAppMessageStatus(nearbyCount === null ? 'failed' : 'sent');
    await showLocalDeliveryNotification(message);

    const smsUrl = await prepareNativeSmsCompose(message);
    if (smsUrl) window.location.href = smsUrl;
  };

  const shareLocation = async () => {
    if (!coords) return;
    await deliverAppMessageThenOpenSms(buildEmergencyMessage(coords), coords);
  };

  const sendNearbyAlert = async (position: { lat: number; lng: number }, message?: string) => {
    const payload = {
      action: 'alert',
      radiusKm: 1,
      deviceId: getOrCreateDeviceId(),
      lat: position.lat,
      lng: position.lng,
      sender: ownerName?.trim() || t.defaultSender,
      phone: ownerPhone,
      contactPhones: contacts.map((contact) => contact.phone),
      message: message || buildEmergencyMessage(position),
    };

    let bestNearbyCount: number | null = null;

    await Promise.all(PRESENCE_ENDPOINTS.map(async (endpoint) => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) return;
        const data = await response.json();
        const count = Number.isFinite(Number(data.nearbyCount)) ? Math.max(0, Number(data.nearbyCount)) : 0;
        bestNearbyCount = bestNearbyCount === null ? count : Math.max(bestNearbyCount, count);
      } catch {
        // try remaining endpoints
      }
    }));

    const finalCount = bestNearbyCount ?? 0;
    setNearbyGuardians(finalCount);
    return bestNearbyCount;
  };

  useEffect(() => {
    if (!coords || autoOpenedRef.current || contacts.length === 0) return;
    autoOpenedRef.current = true;
    const message = buildEmergencyMessage(coords);
    deliverAppMessageThenOpenSms(message, coords);
  }, [coords, contacts, contacts.length, ownerName, ownerPhone, t.alertPrefix, t.defaultSender, t.sosActive]);


  useEffect(() => {
    if (!coords) return;

    if (contacts.length === 0) sendNearbyAlert(coords, buildEmergencyMessage(coords));
    const interval = window.setInterval(() => sendNearbyAlert(coords, buildEmergencyMessage(coords)), 20000);
    return () => window.clearInterval(interval);
  }, [coords, contacts.length]);

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
    <div className="fixed inset-0 z-50 flex flex-col p-6 sm:p-8 overflow-hidden select-none p97-danger-room">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(239,68,68,0.38),transparent_34rem)] emergency-pulse pointer-events-none"></div>
      <div className="relative z-10 flex flex-col h-full">
        <header className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-red-500 font-black tracking-[0.3em] text-[10px] uppercase">{t.sosActive}</span>
          </div>
          <div className="text-white/40 font-mono text-xs">{seconds}s</div>
        </header>

        <div className="flex-1 flex flex-col items-center overflow-y-auto p97-scrollbar pb-4">
          <div className="w-full h-72 p97-luxe-card rounded-[1.5rem] mb-6 overflow-hidden relative shadow-2xl shrink-0">
            {coords ? <MapView lat={coords.lat} lng={coords.lng} zoom={17} /> : <div className="w-full h-full flex items-center justify-center bg-neutral-950 text-[10px] font-black uppercase text-neutral-500">GPS...</div>}
          </div>

          <button disabled={!coords || appMessageStatus === 'sending'} onClick={shareLocation} className="w-full p97-sos-luxe text-white font-black py-6 rounded-[1.5rem] flex flex-col items-center justify-center gap-0.5 mb-6 animate-bounce disabled:opacity-20 shrink-0">
            <div className="flex items-center gap-2"><Send size={20} /><span className="uppercase tracking-[0.2em] text-[12px]">{t.alertContacts}</span></div>
            <span className="text-[9px] opacity-60 uppercase font-black">{appMessageStatus === 'sending' ? (t.appMessageSending || 'Envoi du MP Projet 97') : t.sendingLocation}</span>
          </button>

          {appMessageStatus !== 'idle' && (
            <div className="w-full mb-4 p97-luxe-card rounded-2xl p-4 text-[10px] font-black uppercase tracking-widest text-white/70">
              {appMessageStatus === 'sending' && (t.appMessageSending || 'MP Projet 97 en cours avant SMS natif...')}
              {appMessageStatus === 'sent' && (t.appMessageSent || 'MP Projet 97 envoyé. Ouverture de Messages...')}
              {appMessageStatus === 'failed' && (t.appMessageFailed || "MP appli indisponible: ouverture de Messages quand même.")}
            </div>
          )}

          <div className="w-full p97-luxe-card p-5 rounded-[1.5rem] mb-4">
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
          <button onClick={onDeactivate} className="w-full p97-luxe-card text-neutral-100 font-black py-5 rounded-[1.5rem] flex items-center justify-center gap-3 transition-all active:scale-[0.98]">
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
