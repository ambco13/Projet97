
import React, { useState } from 'react';
import { X, Calendar, MapPin, Mic, Info, ShieldCheck, Download, Share2 } from 'lucide-react';
import { EmergencyLog } from '../types';
import MapView from './MapView';

interface Props {
  logs: EmergencyLog[];
  language: string;
  onClose: () => void;
  translations: any;
}

const HistoryView: React.FC<Props> = ({ logs, language, onClose, translations: t }) => {
  const [selectedMap, setSelectedMap] = useState<EmergencyLog | null>(null);

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

  return (
    <div className="p-8 flex flex-col h-full animate-in slide-in-from-right duration-500 bg-[#050505]">
      <div className="flex justify-between items-center mb-10">
        <div><h2 className="text-3xl font-black text-white tracking-tighter">{t.logs}</h2><p className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em]">{t.securityReports}</p></div>
        <button onClick={onClose} className="p-3 bg-neutral-900 rounded-2xl hover:bg-neutral-800 transition-colors"><X size={24} className="text-neutral-400" /></button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 opacity-20"><Calendar size={80} className="mb-6" /><p className="font-black text-xl">{t.noLogs}</p><p className="text-xs uppercase font-bold">{t.noIncident}</p></div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="bg-neutral-900/40 p-6 rounded-[2.5rem] border border-white/5">
              <div className="text-[10px] font-mono text-neutral-600 mb-4 flex justify-between"><span>REF: {log.id.slice(-6)}</span><span>{log.timestamp}</span></div>
              <div className="flex items-start gap-4 mb-6"><div className={`p-3 rounded-2xl ${log.type === 'TRIGGER' ? 'bg-red-500/10 text-red-500' : 'bg-neutral-800'}`}>{log.type === 'TRIGGER' ? <Mic size={20} /> : <ShieldCheck size={20} />}</div>
              <div><p className="text-[9px] font-black text-neutral-500 uppercase tracking-widest">{log.type}</p><p className="font-bold text-white">{log.detail}</p></div></div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setSelectedMap(log)} className="bg-white/5 py-3 rounded-xl text-[9px] font-black uppercase"><MapPin size={12} className="mx-auto mb-1" />{t.map}</button>
                <button className="bg-white/5 py-3 rounded-xl text-[9px] font-black uppercase"><Share2 size={12} className="mx-auto mb-1" />{t.share}</button>
                <button onClick={() => downloadProof(log)} className="bg-red-600/10 py-3 rounded-xl text-[9px] font-black uppercase"><Download size={12} className="mx-auto mb-1" />{t.proof}</button>
              </div>
            </div>
          ))
        )}
      </div>
      {selectedMap && (
        <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-xl flex flex-col p-8 animate-in zoom-in-95 duration-300">
           <button onClick={() => setSelectedMap(null)} className="p-2 bg-neutral-900 rounded-xl ml-auto mb-6"><X size={20} /></button>
           <div className="flex-1 rounded-3xl overflow-hidden border border-white/10">{selectedMap.coordinates && <MapView lat={selectedMap.coordinates.lat} lng={selectedMap.coordinates.lng} zoom={18} />}</div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
