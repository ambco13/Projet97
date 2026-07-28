import React, { useEffect, useMemo, useState } from 'react';
import { X, Calendar, MapPin, Mic, ShieldCheck, Download, Share2, Layers, Clock3, ChevronUp } from 'lucide-react';
import { EmergencyLog } from '../types';
import MapView from './MapView';

interface Props {
  logs: EmergencyLog[];
  language: string;
  onClose: () => void;
  translations: any;
}

type LogFilter = 'ALL' | EmergencyLog['type'];

const HistoryView: React.FC<Props> = ({ logs, language, onClose, translations: t }) => {
  const [selectedMap, setSelectedMap] = useState<EmergencyLog | null>(null);
  const [selectedLog, setSelectedLog] = useState<EmergencyLog | null>(null);
  const [activeFilter, setActiveFilter] = useState<LogFilter>('ALL');

  const isFrench = language === 'fr';

  const downloadProof = (log: EmergencyLog) => {
    const report = `PROJECT 97 - REPORT\nREF: ${log.id}\nTIMESTAMP: ${log.timestamp}\nTYPE: ${log.type}\nDETAIL: ${log.detail}`;
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `P97_Proof_${log.id.slice(-6)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const shareLog = async (log: EmergencyLog) => {
    const text = `${isFrench ? 'Alerte' : 'Alert'} #${log.id.slice(-6)}\n${log.detail}\n${log.timestamp}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Project 97 - ${log.type}`, text });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        window.alert(isFrench ? 'Détails copiés dans le presse-papiers.' : 'Details copied to clipboard.');
      }
    } catch {
      // Ignore cancel/unavailable share errors
    }
  };

  const filterLabels: Record<LogFilter, string> = {
    ALL: isFrench ? 'Tout' : 'All',
    TRIGGER: isFrench ? 'SOS' : 'SOS',
    AUDIO: isFrench ? 'Enregistrement' : 'Recording',
    LOCATION: isFrench ? 'GPS' : 'GPS',
    DETERRENCE: isFrench ? 'Vocal SOS' : 'SOS voice',
    SYSTEM: isFrench ? 'Système' : 'System',
  };

  const typeDescriptions: Record<EmergencyLog['type'], string> = {
    TRIGGER: isFrench ? 'Déclenchement SOS (manuel, voix, secousse...)' : 'SOS trigger (manual, voice, shake...)',
    AUDIO: isFrench ? 'Aucun enregistrement vocal actuellement (catégorie réservée pour une future version)' : 'No voice recording currently (reserved category for a future version)',
    LOCATION: isFrench ? 'Position GPS envoyée' : 'GPS position update',
    DETERRENCE: isFrench ? 'Message vocal anti-agression diffusé pendant le SOS (diffusion uniquement, pas d’enregistrement)' : 'Automatic deterrence voice message played during SOS (playback only, no recording)',
    SYSTEM: isFrench ? 'Événement technique de l’application' : 'Technical app event',
  };

  const allFilters: LogFilter[] = ['ALL', 'TRIGGER', 'AUDIO', 'LOCATION', 'DETERRENCE', 'SYSTEM'];

  const disabledFilters = useMemo(() => {
    return allFilters.reduce<Record<LogFilter, boolean>>((acc, filter) => {
      if (filter === 'ALL') {
        acc[filter] = false;
        return acc;
      }
      acc[filter] = !logs.some((log) => log.type === filter);
      return acc;
    }, {
      ALL: false,
      TRIGGER: false,
      AUDIO: false,
      LOCATION: false,
      DETERRENCE: false,
      SYSTEM: false,
    });
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (activeFilter === 'ALL') return logs;
    return logs.filter((log) => log.type === activeFilter);
  }, [activeFilter, logs]);

  useEffect(() => {
    if (activeFilter !== 'ALL' && disabledFilters[activeFilter]) {
      setActiveFilter('ALL');
    }
  }, [activeFilter, disabledFilters]);

  const typeCount = useMemo(() => logs.reduce<Record<EmergencyLog['type'], number>>((acc, log) => {
    acc[log.type] = (acc[log.type] || 0) + 1;
    return acc;
  }, { TRIGGER: 0, AUDIO: 0, LOCATION: 0, DETERRENCE: 0, SYSTEM: 0 }), [logs]);

  return (
    <div className="p97-page p-6 flex flex-col h-full animate-in slide-in-from-right duration-500">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="p97-luxe-title text-4xl font-black tracking-tighter">{t.logs}</h2>
          <p className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em]">{t.securityReports}</p>
        </div>
        <button onClick={onClose} className="p-3 p97-luxe-card rounded-2xl hover:bg-white/10 transition-colors">
          <X size={24} className="text-neutral-400" />
        </button>
      </div>

      <div className="mb-4 p97-luxe-card rounded-3xl p-3">
        <div className="grid grid-cols-3 gap-2">
          {allFilters.filter((filter) => filter !== 'ALL').map((type) => (
            <button
              key={type}
              onClick={() => !disabledFilters[type] && setActiveFilter(type)}
              disabled={disabledFilters[type]}
              className={`rounded-xl py-2 text-center transition ${
                disabledFilters[type]
                  ? 'bg-white/[0.03] text-neutral-600 border border-transparent cursor-not-allowed opacity-45'
                  : activeFilter === type
                    ? 'bg-red-600/30 border border-red-500/60'
                    : 'bg-white/5 border border-transparent'
              }`}
            >
              <p className="text-[8px] text-neutral-400 font-black uppercase">{filterLabels[type]}</p>
              <p className="text-xs font-black text-white">{typeCount[type as EmergencyLog['type']] || 0}</p>
            </button>
          ))}
        </div>
        <button
          onClick={() => setActiveFilter('ALL')}
          className={`w-full mt-2 rounded-xl py-2 text-[10px] font-black uppercase tracking-wider ${activeFilter === 'ALL' ? 'bg-white text-black' : 'bg-white/5 text-neutral-300'}`}
        >
          {isFrench ? 'Vue mosaïque complète' : 'Full mosaic view'} · {logs.length}
        </button>
        {activeFilter !== 'ALL' && (
          <p className="mt-2 text-[10px] text-neutral-400 leading-snug">
            {typeDescriptions[activeFilter as EmergencyLog['type']]}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p97-scrollbar">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 opacity-20">
            <Calendar size={80} className="mb-6" />
            <p className="font-black text-xl">{t.noLogs}</p>
            <p className="text-xs uppercase font-bold">{t.noIncident}</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center text-neutral-500">
            <Layers size={36} className="mx-auto mb-3" />
            <p className="font-black uppercase text-xs tracking-widest">{isFrench ? 'Rien à afficher' : 'Nothing to display'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-2">
            {filteredLogs.map((log) => (
              <button
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="text-left p97-luxe-card rounded-2xl p-3 min-h-28 hover:border-red-500/40 hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-neutral-500">#{log.id.slice(-4)}</span>
                  <span className="text-[9px] text-neutral-500">{log.timestamp}</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className={`p-2 rounded-xl ${log.type === 'TRIGGER' ? 'bg-red-500/15 text-red-500' : 'bg-white/5 text-neutral-300'}`}>
                    {log.type === 'TRIGGER' ? <Mic size={14} /> : <ShieldCheck size={14} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-black">{filterLabels[log.type] ?? log.type}</p>
                    <p className="text-xs text-white font-bold leading-tight line-clamp-2">{log.detail}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-[115] bg-slate-950/75 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-[2rem] p97-luxe-card p-5 animate-in slide-in-from-bottom duration-300">
            <div className="w-12 h-1.5 rounded-full bg-neutral-700 mx-auto mb-4" />
            <div className="flex justify-between items-start gap-3 mb-4">
              <div>
                <p className="text-[10px] text-neutral-500 font-mono mb-1">REF: {selectedLog.id.slice(-6)}</p>
                <p className="text-sm text-white font-black">{selectedLog.detail}</p>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1 flex items-center gap-1"><Clock3 size={11} /> {selectedLog.timestamp}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-2 rounded-xl bg-white/5"><ChevronUp size={16} /></button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setSelectedMap(selectedLog)}
                disabled={!selectedLog.coordinates}
                className="bg-white/5 disabled:opacity-40 py-3 rounded-xl text-[9px] font-black uppercase"
              >
                <MapPin size={12} className="mx-auto mb-1" />{t.map}
              </button>
              <button
                onClick={() => shareLog(selectedLog)}
                className="bg-white/5 py-3 rounded-xl text-[9px] font-black uppercase"
              >
                <Share2 size={12} className="mx-auto mb-1" />{t.share}
              </button>
              <button
                onClick={() => downloadProof(selectedLog)}
                className="bg-red-600/10 py-3 rounded-xl text-[9px] font-black uppercase"
              >
                <Download size={12} className="mx-auto mb-1" />{t.proof}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMap && (
        <div className="fixed inset-0 z-[120] p97-page backdrop-blur-xl flex flex-col p-8 animate-in zoom-in-95 duration-300">
          <button onClick={() => setSelectedMap(null)} className="p-2 bg-neutral-900 rounded-xl ml-auto mb-6">
            <X size={20} />
          </button>
          <div className="flex-1 rounded-3xl overflow-hidden border border-white/10">
            {selectedMap.coordinates && <MapView lat={selectedMap.coordinates.lat} lng={selectedMap.coordinates.lng} zoom={18} />}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
