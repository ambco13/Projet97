import React, { useMemo, useState } from 'react';
import { X, Calendar, MapPin, Mic, ShieldCheck, Download, Share2, ChevronRight, Layers } from 'lucide-react';
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

  const filterLabels: Record<LogFilter, string> = {
    ALL: isFrench ? 'Tout' : 'All',
    TRIGGER: isFrench ? 'Alertes' : 'Alerts',
    AUDIO: isFrench ? 'Audio' : 'Audio',
    LOCATION: isFrench ? 'GPS' : 'GPS',
    DETERRENCE: isFrench ? 'Dissuasion' : 'Deterrence',
    SYSTEM: isFrench ? 'Système' : 'System',
  };

  const filters = useMemo(() => {
    const allFilters: LogFilter[] = ['ALL', 'TRIGGER', 'AUDIO', 'LOCATION', 'DETERRENCE', 'SYSTEM'];
    return allFilters.filter((filter) => {
      if (filter === 'ALL') return true;
      return logs.some((log) => log.type === filter);
    });
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (activeFilter === 'ALL') return logs;
    return logs.filter((log) => log.type === activeFilter);
  }, [activeFilter, logs]);

  return (
    <div className="p-8 flex flex-col h-full animate-in slide-in-from-right duration-500 bg-[#050505]">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter">{t.logs}</h2>
          <p className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em]">{t.securityReports}</p>
        </div>
        <button onClick={onClose} className="p-3 bg-neutral-900 rounded-2xl hover:bg-neutral-800 transition-colors">
          <X size={24} className="text-neutral-400" />
        </button>
      </div>

      <div className="mb-6 rounded-3xl border border-white/10 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between gap-2 mb-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-black">
            {isFrench ? 'Vue compacte' : 'Compact view'}
          </p>
          <div className="text-[10px] text-neutral-500 font-mono">{filteredLogs.length} / {logs.length}</div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition ${
                activeFilter === filter
                  ? 'bg-red-600 text-white'
                  : 'bg-white/5 text-neutral-300 hover:bg-white/10'
              }`}
            >
              {filterLabels[filter]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 opacity-20">
            <Calendar size={80} className="mb-6" />
            <p className="font-black text-xl">{t.noLogs}</p>
            <p className="text-xs uppercase font-bold">{t.noIncident}</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center text-neutral-500">
            <Layers size={36} className="mx-auto mb-3" />
            <p className="font-black uppercase text-xs tracking-widest">{isFrench ? 'Aucun événement dans ce filtre' : 'No events in this filter'}</p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 custom-scrollbar">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="snap-start shrink-0 w-[82%] bg-neutral-900/50 p-5 rounded-[2rem] border border-white/10"
              >
                <div className="text-[10px] font-mono text-neutral-600 mb-4 flex justify-between">
                  <span>REF: {log.id.slice(-6)}</span>
                  <span>{log.timestamp}</span>
                </div>

                <div className="flex items-start gap-3 mb-5">
                  <div className={`p-3 rounded-2xl ${log.type === 'TRIGGER' ? 'bg-red-500/15 text-red-500' : 'bg-neutral-800 text-neutral-300'}`}>
                    {log.type === 'TRIGGER' ? <Mic size={18} /> : <ShieldCheck size={18} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black text-neutral-500 uppercase tracking-widest">{log.type}</p>
                    <p className="font-bold text-white text-sm leading-tight">{log.detail}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setSelectedMap(log)} className="bg-white/5 py-3 rounded-xl text-[9px] font-black uppercase">
                    <MapPin size={12} className="mx-auto mb-1" />{t.map}
                  </button>
                  <button className="bg-white/5 py-3 rounded-xl text-[9px] font-black uppercase">
                    <Share2 size={12} className="mx-auto mb-1" />{t.share}
                  </button>
                  <button onClick={() => downloadProof(log)} className="bg-red-600/10 py-3 rounded-xl text-[9px] font-black uppercase">
                    <Download size={12} className="mx-auto mb-1" />{t.proof}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {filteredLogs.length > 1 && (
        <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-black flex items-center justify-center gap-1">
          {isFrench ? 'Glisse pour parcourir' : 'Swipe to browse'} <ChevronRight size={12} />
        </p>
      )}

      {selectedMap && (
        <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-xl flex flex-col p-8 animate-in zoom-in-95 duration-300">
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
