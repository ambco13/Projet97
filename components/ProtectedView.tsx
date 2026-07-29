import React, { useEffect, useRef, useState } from 'react';
import { Shield, Mic, MapPin, Zap, Users, Globe, Move, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Contact } from '../types';
import { PRESENCE_ENDPOINTS, PUSH_PUBLIC_KEY_ENDPOINTS, PUSH_SUBSCRIBE_ENDPOINTS } from '../apiEndpoints';

interface Props {
  contacts: Contact[];
  ownerPhone: string;
  isListening: boolean;
  guardianNetwork: boolean;
  language: string;
  protectionEnabled: boolean;
  onTrigger: () => void;
  onToggleProtection: () => void;
  onShowHistory: () => void;
  translations: any;
}

interface PresenceErrorResponse {
  error?: string;
  detail?: string;
}

interface PresenceResponse {
  count: number;
  trend?: 'up' | 'down' | 'stable';
  engine?: string;
  latency?: string;
  incomingAlerts?: number;
  latestAlertId?: string | null;
  latestAlertLat?: number | null;
  latestAlertLng?: number | null;
  latestAlertSender?: string | null;
  latestAlertPrecision?: 'exact' | 'approximate' | null;
  latestAlertIsSelf?: boolean;
  latestAlertMessage?: string | null;
}

const POLL_INTERVAL_MS = 10000;
const DEVICE_ID_KEY = 'p97_device_id';
const ALERT_NOTIFICATION_TAG = 'p97-nearby-sos';
const ALERT_NOTIFICATION_COOLDOWN_MS = 30000;


const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
};

const fetchFirstOkJson = async <T,>(endpoints: string[], init?: RequestInit): Promise<T | null> => {
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, init);
      if (response.ok) return (await response.json()) as T;
    } catch {
      // try next endpoint
    }
  }
  return null;
};

const ALERT_97_BY_LANG: Record<string, string> = {
  fr: 'Alerte 97',
  en: 'Alert 97',
  ar: 'إنذار 97',
  he: 'התראה 97',
};

const ProtectedView: React.FC<Props> = ({ contacts, ownerPhone, isListening, guardianNetwork, language, protectionEnabled, onTrigger, onToggleProtection, onShowHistory, translations: t }) => {
  const [pulse, setPulse] = useState(false);
  const [guardianCount, setGuardianCount] = useState<number>(0);
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
  const [cloudInfo, setCloudInfo] = useState<{ latency: string; engine: string } | null>({
    latency: 'connecting',
    engine: 'CLOUD_CONNECTING',
  });
  const [dbStatus, setDbStatus] = useState<'CONNECTING' | 'LIVE' | 'DEGRADED'>('CONNECTING');
  const [incomingAlertActive, setIncomingAlertActive] = useState(false);
  const [incomingAlertCoords, setIncomingAlertCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [incomingAlertSender, setIncomingAlertSender] = useState<string | null>(null);
  const [incomingAlertPrecision, setIncomingAlertPrecision] = useState<'exact' | 'approximate' | null>(null);
  const [incomingAlertIsSelf, setIncomingAlertIsSelf] = useState(false);
  const [incomingAlertMessage, setIncomingAlertMessage] = useState<string | null>(null);
  const previousCountRef = useRef(0);
  const lastIncomingAlertIdRef = useRef<string | null>(null);
  const lastAlertNotificationTimeRef = useRef<number>(0);

  const notifyNearbySos = async (message?: string | null) => {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
      } catch {
        return;
      }
    } else if (Notification.permission !== 'granted') {
      return;
    }

    const title = 'Projet 97';
    const alert97Text = ALERT_97_BY_LANG[language] || ALERT_97_BY_LANG.fr;
    const options: NotificationOptions = {
      body: message || `${alert97Text} — ${t.nearbySosDetected || 'Alerte SOS à proximité (≤ 1 km).'}`,
      tag: ALERT_NOTIFICATION_TAG,
      requireInteraction: true,
    };

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(title, options);
          return;
        }
      }
      new Notification(title, options);
    } catch {
      // Silent fallback
    }
  };
  const getCurrentCoordinates = () =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 15000 },
      );
    });

  useEffect(() => {
    const registerPushSubscription = async () => {
      if (!guardianNetwork || !ownerPhone.trim()) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
        : Notification.permission;
      if (permission !== 'granted') return;

      const keyResponse = await fetchFirstOkJson<{ publicKey?: string }>(PUSH_PUBLIC_KEY_ENDPOINTS);
      if (!keyResponse?.publicKey) return;

      let deviceId = localStorage.getItem(DEVICE_ID_KEY);
      if (!deviceId) {
        const uuid = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        deviceId = `p97_${uuid}`;
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyResponse.publicKey),
      });

      await fetchFirstOkJson(PUSH_SUBSCRIBE_ENDPOINTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, phone: ownerPhone, subscription }),
      });
    };

    registerPushSubscription().catch(() => undefined);
  }, [guardianNetwork, ownerPhone]);

  useEffect(() => {
    const pulseInterval = setInterval(() => setPulse((p) => !p), 2000);
    return () => clearInterval(pulseInterval);
  }, []);

  useEffect(() => {
    const updateTrend = (nextCount: number) => {
      const previousCount = previousCountRef.current;
      if (nextCount > previousCount) setTrend('up');
      else if (nextCount < previousCount) setTrend('down');
      else setTrend('stable');
      previousCountRef.current = nextCount;
    };

    const setCloudUnavailable = (reason: string) => {
      setDbStatus('DEGRADED');
      setGuardianCount(0);
      setTrend('stable');
      setIncomingAlertActive(false);
      setIncomingAlertCoords(null);
      setIncomingAlertSender(null);
      setIncomingAlertPrecision(null);
      setIncomingAlertIsSelf(false);
      setIncomingAlertMessage(null);
      setCloudInfo({ latency: 'error', engine: reason });
    };

    const syncPresence = async () => {
      if (!guardianNetwork) {
        setCloudUnavailable('GUARDIAN_NETWORK_DISABLED');
        return;
      }

      setDbStatus('CONNECTING');

      let deviceId = localStorage.getItem(DEVICE_ID_KEY);
      if (!deviceId) {
        const uuid = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        deviceId = `p97_${uuid}`;
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
      }

      const coords = await getCurrentCoordinates();

      try {
        let response: Response | null = null;
        let lastFailureReason = 'CLOUD_UNAVAILABLE';
        for (const endpoint of PRESENCE_ENDPOINTS) {
          try {
            const candidate = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                deviceId,
                phone: ownerPhone,
                lat: coords?.lat,
                lng: coords?.lng,
              }),
            });

            if (candidate.ok) {
              response = candidate;
              break;
            }

            const errorPayload = (await candidate.json().catch(() => ({}))) as PresenceErrorResponse;
            const errorCode = typeof errorPayload.error === 'string' && errorPayload.error.trim()
              ? errorPayload.error.trim()
              : `HTTP_${candidate.status}`;
            lastFailureReason = errorCode;
          } catch {
            lastFailureReason = 'NETWORK_UNREACHABLE';
          }
        }

        if (!response) {
          throw new Error(lastFailureReason);
        }

        const data = (await response.json()) as PresenceResponse;
        const safeCount = Number.isFinite(Number(data.count)) ? Math.max(0, Number(data.count)) : 0;
        const hasIncomingAlert = Number(data.incomingAlerts || 0) > 0;
        const latestAlertId = data.latestAlertId || null;
        const latestAlertLat = Number.isFinite(Number(data.latestAlertLat)) ? Number(data.latestAlertLat) : null;
        const latestAlertLng = Number.isFinite(Number(data.latestAlertLng)) ? Number(data.latestAlertLng) : null;
        const latestAlertMessage = hasIncomingAlert && data.latestAlertMessage ? String(data.latestAlertMessage) : null;

        setDbStatus('LIVE');
        setGuardianCount(safeCount);
        setIncomingAlertActive(hasIncomingAlert);
        setIncomingAlertCoords(hasIncomingAlert && latestAlertLat !== null && latestAlertLng !== null
          ? { lat: latestAlertLat, lng: latestAlertLng }
          : null);
        setIncomingAlertSender(hasIncomingAlert ? (data.latestAlertSender || null) : null);
        setIncomingAlertPrecision(hasIncomingAlert ? (data.latestAlertPrecision || 'approximate') : null);
        setIncomingAlertIsSelf(hasIncomingAlert ? Boolean(data.latestAlertIsSelf) : false);
        setIncomingAlertMessage(latestAlertMessage);
        setCloudInfo({
          latency: data.latency || 'n/a',
          engine: data.engine || 'CLOUD_UNKNOWN',
        });

        if (hasIncomingAlert) {
          const isNewAlert = Boolean(latestAlertId && latestAlertId !== lastIncomingAlertIdRef.current);
          if (latestAlertId) {
            lastIncomingAlertIdRef.current = latestAlertId;
          }
          const now = Date.now();
          const cooldownReached = now - lastAlertNotificationTimeRef.current >= ALERT_NOTIFICATION_COOLDOWN_MS;

          if (isNewAlert || cooldownReached) {
            lastAlertNotificationTimeRef.current = now;
            if (navigator.vibrate) navigator.vibrate([120, 80, 120, 80, 300]);
            notifyNearbySos(latestAlertMessage);
          }
        } else {
          lastAlertNotificationTimeRef.current = 0;
        }
        if (data.trend) setTrend(data.trend);
        else updateTrend(safeCount);
      } catch (error) {
        setCloudUnavailable(error instanceof Error && error.message ? error.message : 'CLOUD_UNAVAILABLE');
      }
    };

    syncPresence();
    const pollInterval = setInterval(syncPresence, POLL_INTERVAL_MS);

    return () => clearInterval(pollInterval);
  }, [guardianNetwork, language, ownerPhone, t.nearbySosDetected]);

  return (
    <div className="flex flex-col p-6 pb-36 animate-in fade-in zoom-in-95 duration-700">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="p97-eyebrow">Projet 97</p>
          <h1 className="p97-luxe-title text-3xl mt-1">Guardian</h1>
        </div>
        <div
          className="p97-chrome-pill flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold"
          style={protectionEnabled ? { borderColor: 'var(--p97-safe-line)', color: 'var(--p97-safe)' } : { color: 'var(--p97-text-3)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: protectionEnabled ? 'var(--p97-safe)' : 'var(--p97-text-3)' }}
          />
          {protectionEnabled ? t.active : (t.inactive || 'Inactif')}
        </div>
      </header>

      <div className="flex flex-col items-center justify-center mb-12">
        <div className="relative w-52 h-52 flex items-center justify-center">
          <div
            className={`absolute inset-[-28px] rounded-full border transition-all duration-[2000ms] ${pulse ? 'scale-110 opacity-100' : 'scale-90 opacity-0'}`}
            style={{ borderColor: 'var(--p97-safe-line)' }}
          />
          <div
            className={`absolute inset-[-14px] rounded-full border transition-all duration-[1500ms] ${pulse ? 'scale-105 opacity-100' : 'scale-95 opacity-0'}`}
            style={{ borderColor: 'var(--p97-safe-line)' }}
          />

          <div className="relative z-10 w-full h-full rounded-full p97-safe-orb flex flex-col items-center justify-center gap-3">
            <Shield
              size={56}
              style={{ color: protectionEnabled ? 'var(--p97-safe)' : 'var(--p97-text-3)' }}
              fill="currentColor"
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: protectionEnabled ? 'var(--p97-safe)' : 'var(--p97-text-3)' }}
            >
              {protectionEnabled ? t.active : (t.inactive || 'Inactif')}
            </span>
          </div>

          {guardianNetwork && (
            <div className="p97-mini-card absolute -bottom-5 z-20 flex items-center gap-2 rounded-full px-3.5 py-2 whitespace-nowrap">
              {dbStatus === 'CONNECTING' ? (
                <>
                  <Globe size={13} className="animate-spin" style={{ color: 'var(--p97-text-3)' }} />
                  <span className="text-[11px] font-medium" style={{ color: 'var(--p97-text-3)' }}>Sync…</span>
                </>
              ) : (
                <>
                  <Users size={13} style={{ color: dbStatus === 'LIVE' ? 'var(--p97-text-2)' : 'var(--p97-accent)' }} />
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--p97-text)' }}>
                    {dbStatus === 'LIVE' ? guardianCount : '—'}
                  </span>
                  {dbStatus === 'LIVE' && trend === 'up' && <ArrowUpRight size={12} style={{ color: 'var(--p97-safe)' }} />}
                  {dbStatus === 'LIVE' && trend === 'down' && <ArrowDownRight size={12} style={{ color: 'var(--p97-accent)' }} />}
                  {(dbStatus !== 'LIVE' || trend === 'stable') && <Minus size={12} style={{ color: 'var(--p97-text-3)' }} />}
                  {cloudInfo && dbStatus === 'LIVE' && (
                    <span className="text-[10px] font-medium pl-2 ml-1 border-l" style={{ color: 'var(--p97-text-3)', borderColor: 'var(--p97-line)' }}>
                      {cloudInfo.latency}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="text-center mt-14 px-4">
          <h2 className="p97-display">{t.protectionActive}</h2>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Move size={14} style={{ color: 'var(--p97-text-3)' }} className="shrink-0" />
            <p className="p97-body max-w-[280px]">{t.voiceInstruction}</p>
          </div>
        </div>
      </div>

      <div className="w-full grid grid-cols-2 gap-3 mb-6">
        <div className="p97-luxe-card p97-section flex flex-col gap-3">
          <Mic
            size={18}
            style={{ color: isListening ? 'var(--p97-safe)' : 'var(--p97-text-3)' }}
            className={isListening ? 'animate-pulse' : ''}
          />
          <div>
            <p className="p97-eyebrow">{t.microphone}</p>
            <p className="text-sm font-semibold mt-0.5 truncate" style={{ color: 'var(--p97-text)' }}>
              {protectionEnabled ? t.listening : (t.sleeping || 'Pause')}
            </p>
          </div>
        </div>

        <div className="p97-luxe-card p97-section flex flex-col gap-3">
          <MapPin size={18} style={{ color: 'var(--p97-text-3)' }} />
          <div>
            <p className="p97-eyebrow">{t.gpsMesh}</p>
            <p className="text-sm font-semibold mt-0.5 truncate" style={{ color: 'var(--p97-text)' }}>
              {guardianNetwork ? t.community : t.private}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {incomingAlertActive && (
          <div
            role="alert"
            className="p97-section space-y-3"
            style={{ background: 'var(--p97-accent-soft)', border: '1px solid var(--p97-accent-line)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--p97-accent)' }}>
              {incomingAlertIsSelf
                ? (t.yourSosBroadcasting || 'Votre SOS est en cours de diffusion (rayon 1 km).')
                : (t.nearbySosDetected || 'SOS détecté à proximité (rayon 1 km)')}
            </p>
            {incomingAlertMessage && (
              <div className="p97-mini-card p-3">
                <p className="p97-eyebrow mb-1">{t.inAppMessage || 'MP appli'}</p>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--p97-text)' }}>{incomingAlertMessage}</p>
              </div>
            )}
            {incomingAlertSender && (
              <p className="text-xs" style={{ color: 'var(--p97-text-2)' }}>{t.sender || 'Émetteur'} : {incomingAlertSender}</p>
            )}
            {incomingAlertCoords && (
              <a
                className="p97-mini-card inline-flex items-center justify-center px-4 py-2.5 text-[13px] font-medium"
                style={{ color: 'var(--p97-text)' }}
                href={`https://www.google.com/maps?q=${incomingAlertCoords.lat},${incomingAlertCoords.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                {t.viewRequesterLocation || 'Voir la position de la personne en danger'}
              </a>
            )}
            {incomingAlertPrecision === 'approximate' && (
              <p className="text-xs" style={{ color: 'var(--p97-text-3)' }}>
                {t.approximateAlertHint || 'Localisation approximative (GPS indisponible pour certains guardians).'}
              </p>
            )}
          </div>
        )}

        <div className="p97-luxe-card p97-section flex items-center gap-4">
          <div className="p97-icon-tile p-3 shrink-0">
            <Zap size={18} style={{ color: 'var(--p97-accent)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="p97-eyebrow">{t.alertNetwork}</p>
            <p className="text-sm font-semibold truncate mt-0.5" style={{ color: 'var(--p97-text)' }}>
              {contacts.length} {t.contacts} + {t.guardianNet}
            </p>
          </div>
        </div>

        {protectionEnabled && (
          <button
            onClick={onTrigger}
            className="w-full p97-sos-luxe py-5 text-sm font-semibold uppercase tracking-[0.08em] active:scale-[0.98]"
          >
            {t.manualSos}
          </button>
        )}
        <button
          onClick={onToggleProtection}
          className="w-full p97-toggle-action py-4 text-[13px] font-medium active:scale-[0.99]"
          style={protectionEnabled ? undefined : { color: 'var(--p97-safe)', borderColor: 'var(--p97-safe-line)' }}
        >
          {protectionEnabled ? (t.disableProtection || 'Désactiver la protection') : (t.enableProtection || 'Activer la protection')}
        </button>

        {cloudInfo && (
          <p className="text-center font-mono text-[10px] pt-1" style={{ color: 'var(--p97-text-3)' }}>
            {t.engine}: {cloudInfo.engine}
          </p>
        )}
      </div>
    </div>
  );
};

export default ProtectedView;
