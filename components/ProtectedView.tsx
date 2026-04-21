import React, { useEffect, useRef, useState } from 'react';
import { Shield, Mic, MapPin, Zap, Users, Globe, Move, ArrowUpRight, ArrowDownRight, Minus, Activity } from 'lucide-react';
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

interface PresenceResponse {
  count: number;
  trend?: 'up' | 'down' | 'stable';
  engine?: string;
  latency?: string;
}

const PRESENCE_ENDPOINTS = ['/.netlify/functions/presence', '/api/presence'];
const POLL_INTERVAL_MS = 30000;

const ProtectedView: React.FC<Props> = ({ contacts, isListening, guardianNetwork, language, onTrigger, onShowHistory, translations: t }) => {
  const [pulse, setPulse] = useState(false);
  const [guardianCount, setGuardianCount] = useState<number>(0);
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
  const [cloudInfo, setCloudInfo] = useState<{ latency: string; engine: string } | null>({
    latency: 'connecting',
    engine: 'CLOUD_CONNECTING',
  });
  const [dbStatus, setDbStatus] = useState<'CONNECTING' | 'LIVE' | 'OFFLINE'>('CONNECTING');
  const previousCountRef = useRef(0);

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
      setDbStatus('OFFLINE');
      setGuardianCount(0);
      setTrend('stable');
      setCloudInfo({ latency: 'error', engine: reason });
    };

    const syncPresence = async () => {
      if (!guardianNetwork) {
        setCloudUnavailable('GUARDIAN_NETWORK_DISABLED');
        return;
      }

      setDbStatus('CONNECTING');

      const deviceIdKey = 'p97_device_id';
      let deviceId = localStorage.getItem(deviceIdKey);
      if (!deviceId) {
        const uuid = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        deviceId = `p97_${uuid}`;
        localStorage.setItem(deviceIdKey, deviceId);
      }

      try {
        let response: Response | null = null;
        for (const endpoint of PRESENCE_ENDPOINTS) {
          try {
            const candidate = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ deviceId }),
            });

            if (candidate.ok) {
              response = candidate;
              break;
            }
          } catch {
            // Continue to next endpoint
          }
        }

        if (!response) {
          throw new Error('Presence API unavailable');
        }

        const data = (await response.json()) as PresenceResponse;
        const safeCount = Number.isFinite(Number(data.count)) ? Math.max(0, Number(data.count)) : 0;

        setDbStatus('LIVE');
        setGuardianCount(safeCount);
        setCloudInfo({
          latency: data.latency || 'n/a',
          engine: data.engine || 'CLOUD_UNKNOWN',
        });
        if (data.trend) setTrend(data.trend);
        else updateTrend(safeCount);
      } catch {
        setCloudUnavailable('CLOUD_UNAVAILABLE');
      }
    };

    syncPresence();
    const pollInterval = setInterval(syncPresence, POLL_INTERVAL_MS);

    return () => clearInterval(pollInterval);
  }, [guardianNetwork]);

  return (
    <div className="flex flex-col p-6 pb-40 animate-in fade-in zoom-in-95 duration-700">
      <div className="flex flex-col items-center justify-center pt-10 mb-12">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div className={`absolute inset-[-30px] border border-green-500/10 rounded-full transition-all duration-[2000ms] ${pulse ? 'scale-110 opacity-40' : 'scale-90 opacity-0'}`}></div>
          <div className={`absolute inset-[-15px] border border-green-500/20 rounded-full transition-all duration-[1500ms] ${pulse ? 'scale-105 opacity-60' : 'scale-95 opacity-0'}`}></div>

          <div className="relative z-10 w-full h-full rounded-full bg-neutral-950 border-[3px] border-green-500/40 flex flex-col items-center justify-center shadow-[0_0_60px_rgba(34,197,94,0.2)]">
            <div className="absolute inset-2 border border-green-500/5 rounded-full animate-[spin_10s_linear_infinite]"></div>
            <Shield size={64} className="text-green-500 mb-2 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]" fill="currentColor" fillOpacity={0.1} />
            <div className="h-1 w-10 bg-green-500/20 rounded-full mb-1"></div>
            <span className="text-[10px] font-black tracking-[0.4em] text-green-500 uppercase ml-1">{t.active}</span>
          </div>

          {guardianNetwork && (
            <div className={`absolute -bottom-4 z-20 px-4 py-2 rounded-full border flex flex-col items-center shadow-xl transition-all duration-500 whitespace-nowrap ${
              dbStatus === 'LIVE' ? 'bg-blue-600 border-blue-400/30' : 'bg-red-700/80 border-red-400/20 opacity-90'
            }`}>
              {dbStatus === 'CONNECTING' ? (
                <div className="flex items-center gap-2 py-1 px-2">
                  <Globe size={12} className="text-white/50 animate-spin" />
                  <span className="text-[8px] font-black text-white/80 uppercase tracking-tighter">Syncing...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <Users size={12} className="text-white shrink-0" />
                    <span className="text-[11px] font-black text-white tabular-nums animate-in fade-in slide-in-from-bottom-1">
                      {dbStatus === 'LIVE' ? guardianCount : 'ERR'}
                    </span>
                    <div className="flex flex-col items-center ml-0.5">
                      {dbStatus === 'LIVE' && trend === 'up' && <ArrowUpRight size={10} className="text-green-300 animate-bounce" />}
                      {dbStatus === 'LIVE' && trend === 'down' && <ArrowDownRight size={10} className="text-red-300 animate-bounce" />}
                      {(dbStatus !== 'LIVE' || trend === 'stable') && <Minus size={10} className="text-white/40" />}
                    </div>
                  </div>
                  {cloudInfo && (
                    <div className="flex items-center gap-2 px-3 pb-1 border-t border-white/10 w-full justify-center">
                      <Activity size={8} className="text-blue-200" />
                      <span className="text-[6px] font-bold text-white/70 uppercase tracking-widest">{cloudInfo.latency}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-center space-y-2 mt-12">
          <h2 className="text-3xl font-black text-white tracking-tighter">{t.protectionActive}</h2>
          <div className="flex items-center justify-center gap-2 text-neutral-500">
            <Move size={14} className="animate-bounce" />
            <p className="text-sm font-medium leading-relaxed max-w-[260px]">{t.voiceInstruction}</p>
          </div>
        </div>
      </div>

      <div className="w-full grid grid-cols-2 gap-4 mb-8">
        <div className="bg-neutral-900/40 p-5 rounded-[2rem] border border-white/5 backdrop-blur-sm flex flex-col items-center text-center">
          <div className="flex items-center justify-center mb-3 relative">
            <Mic size={20} className={isListening ? 'text-green-500 animate-pulse' : 'text-neutral-600'} />
            {isListening && (
              <div className="absolute -top-1 -right-4 flex gap-0.5">
                <div className="w-0.5 h-2 bg-green-500/50 rounded-full animate-[bounce_0.8s_infinite_100ms]"></div>
                <div className="w-0.5 h-3 bg-green-500/80 rounded-full animate-[bounce_0.8s_infinite_300ms]"></div>
              </div>
            )}
          </div>
          <p className="text-[9px] font-black text-neutral-600 uppercase tracking-widest mb-1">{t.microphone}</p>
          <p className="text-[11px] font-black text-white truncate w-full uppercase">{t.listening}</p>
        </div>

        <div className="bg-neutral-900/40 p-5 rounded-[2rem] border border-white/5 backdrop-blur-sm flex flex-col items-center text-center">
          <MapPin size={20} className="text-blue-500 mb-3" />
          <p className="text-[9px] font-black text-neutral-600 uppercase tracking-widest mb-1">{t.gpsMesh}</p>
          <p className="text-[11px] font-black text-white uppercase">{guardianNetwork ? t.community : t.private}</p>
        </div>
      </div>

      <div className="space-y-4">
        {cloudInfo && (
          <div className="flex justify-between items-center px-4 opacity-30 text-white font-mono text-[7px] uppercase tracking-tighter">
            <span>{t.engine}: {cloudInfo.engine}</span>
            <span>MODE: {dbStatus === 'LIVE' ? 'CLOUD' : 'OFFLINE'}</span>
          </div>
        )}

        <div className="bg-neutral-900/60 p-5 rounded-[1.5rem] border border-white/5 flex items-center gap-4">
          <div className="bg-red-500/10 p-3 rounded-xl shrink-0">
            <Zap className="text-red-500" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-neutral-500 font-black uppercase mb-0.5">{t.alertNetwork}</p>
            <p className="text-white text-xs font-bold truncate">
              {contacts.length} {t.contacts} + {t.guardianNet}
            </p>
          </div>
        </div>

        <button
          onClick={onTrigger}
          className="w-full bg-white text-black font-black py-5 rounded-[1.5rem] shadow-xl hover:bg-red-600 hover:text-white transition-all transform active:scale-[0.97] uppercase tracking-widest text-xs"
        >
          {t.manualSos}
        </button>
      </div>
    </div>
  );
};

export default ProtectedView;
