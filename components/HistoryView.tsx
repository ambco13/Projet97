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
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="p97-luxe-title text-2xl">{t.logs}</h2>
          <p className="p97-eyebrow mt-1">{t.securityReports}</p>
        </div>
        <button onClick={onClose} aria-label={t.close || 'Fermer'} className="p-3 p97-luxe-card transition-colors" style={{ color: 'var(--p97-text-2)' }}>
          <X size={20} />
        </button>
      </div>

      <div className="mb-4 p97-luxe-card p97-section p-3">
        <div className="grid grid-cols-3 gap-2">
          {allFilters.filter((filter) => filter !== 'ALL').map((type) => {
            const isDisabled = disabledFilters[type];
            const isActive = activeFilter === type;
            return (
              <button
                key={type}
                onClick={() => !isDisabled && setActiveFilter(type)}
                disabled={isDisabled}
                aria-pressed={isActive}
                className="rounded-[var(--p97-r-sm)] py-2.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: isActive ? 'var(--p97-accent-soft)' : 'var(--p97-surface-2)',
                  border: `1px solid ${isActive ? 'var(--p97-accent-line)' : 'transparent'}`,
                }}
              >
                <p className="text-[10px] font-medium" style={{ color: isActive ? 'var(--p97-accent)' : 'var(--p97-text-3)' }}>{filterLabels[type]}</p>
                <p className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: 'var(--p97-text)' }}>{typeCount[type as EmergencyLog['type']] || 0}</p>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setActiveFilter('ALL')}
          aria-pressed={activeFilter === 'ALL'}
          className="w-full mt-2 rounded-[var(--p97-r-sm)] py-2.5 text-[13px] font-medium transition-colors"
          style={activeFilter === 'ALL'
            ? { background: 'var(--p97-accent-soft)', color: 'var(--p97-accent)', border: '1px solid var(--p97-accent-line)' }
            : { background: 'var(--p97-surface-2)', color: 'var(--p97-text-2)', border: '1px solid transparent' }}
        >
          {isFrench ? 'Tout afficher' : 'Show all'} · {logs.length}
        </button>
        {activeFilter !== 'ALL' && (
          <p className="mt-2.5 text-xs leading-relaxed" style={{ color: 'var(--p97-text-3)' }}>
            {typeDescriptions[activeFilter as EmergencyLog['type']]}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p97-scrollbar">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20" style={{ color: 'var(--p97-text-3)' }}>
            <Calendar size={56} strokeWidth={1.2} className="mb-5 opacity-50" />
            <p className="text-lg font-semibold" style={{ color: 'var(--p97-text-2)' }}>{t.noLogs}</p>
            <p className="text-[13px] mt-1">{t.noIncident}</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center" style={{ color: 'var(--p97-text-3)' }}>
            <Layers size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-50" />
            <p className="text-[13px]">{isFrench ? 'Rien à afficher' : 'Nothing to display'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-2">
            {filteredLogs.map((log) => (
              <button
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="text-left p97-mini-card p-3.5 min-h-32 hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono" style={{ color: 'var(--p97-text-3)' }}>#{log.id.slice(-4)}</span>
                  <span className="text-[11px]" style={{ color: 'var(--p97-text-3)' }}>{log.timestamp}</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <div
                    className="p-2 rounded-[var(--p97-r-sm)] shrink-0"
                    style={log.type === 'TRIGGER'
                      ? { background: 'var(--p97-accent-soft)', color: 'var(--p97-accent)' }
                      : { background: 'var(--p97-surface-3)', color: 'var(--p97-text-2)' }}
                  >
                    {log.type === 'TRIGGER' ? <Mic size={14} /> : <ShieldCheck size={14} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium" style={{ color: 'var(--p97-text-3)' }}>{filterLabels[log.type] ?? log.type}</p>
                    <p className="text-[13px] font-medium leading-snug line-clamp-2 mt-0.5" style={{ color: 'var(--p97-text)' }}>{log.detail}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-[115] bg-black/70 backdrop-blur-sm flex items-end">
          <div
            className="w-full p97-luxe-card p-5 animate-in slide-in-from-bottom duration-300"
            style={{ borderRadius: 'var(--p97-r-xl) var(--p97-r-xl) 0 0', paddingBottom: 'calc(1.25rem + var(--p97-safe-bottom))' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'var(--p97-line-strong)' }} />
            <div className="flex justify-between items-start gap-3 mb-5">
              <div className="min-w-0">
                <p className="text-[11px] font-mono mb-1.5" style={{ color: 'var(--p97-text-3)' }}>REF {selectedLog.id.slice(-6)}</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--p97-text)' }}>{selectedLog.detail}</p>
                <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: 'var(--p97-text-3)' }}><Clock3 size={12} /> {selectedLog.timestamp}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} aria-label={t.close || 'Fermer'} className="p97-mini-card p-2.5 shrink-0" style={{ color: 'var(--p97-text-2)' }}><ChevronUp size={16} /></button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'map', Icon: MapPin, label: t.map, onClick: () => setSelectedMap(selectedLog), disabled: !selectedLog.coordinates },
                { key: 'share', Icon: Share2, label: t.share, onClick: () => shareLog(selectedLog), disabled: false },
                { key: 'proof', Icon: Download, label: t.proof, onClick: () => downloadProof(selectedLog), disabled: false },
              ]).map(({ key, Icon, label, onClick, disabled }) => (
                <button
                  key={key}
                  onClick={onClick}
                  disabled={disabled}
                  className="p97-mini-card py-3 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: 'var(--p97-text-2)' }}
                >
                  <Icon size={15} className="mx-auto mb-1.5" />{label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedMap && (
        <div className="fixed inset-0 z-[120] p97-page flex flex-col p-6 animate-in fade-in duration-200">
          <button onClick={() => setSelectedMap(null)} aria-label={t.close || 'Fermer'} className="p97-mini-card p-2.5 ml-auto mb-5" style={{ color: 'var(--p97-text-2)' }}>
            <X size={20} />
          </button>
          <div className="flex-1 overflow-hidden border" style={{ borderRadius: 'var(--p97-r-lg)', borderColor: 'var(--p97-line)' }}>
            {selectedMap.coordinates && <MapView lat={selectedMap.coordinates.lat} lng={selectedMap.coordinates.lng} zoom={18} />}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
