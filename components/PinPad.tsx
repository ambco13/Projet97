
import React, { useState } from 'react';
import { X, Delete } from 'lucide-react';

interface Props {
  correctPin: string;
  language: string;
  onSuccess: () => void;
  onCancel: () => void;
  translations: any;
}

const PinPad: React.FC<Props> = ({ correctPin, language, onSuccess, onCancel, translations: t }) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  const handlePress = (num: string) => {
    setError(false);
    if (input.length < 4) {
      const newVal = input + num;
      setInput(newVal);
      if (newVal.length === 4) {
        if (newVal === correctPin) { onSuccess(); } else { setError(true); setTimeout(() => setInput(''), 500); }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] p97-page flex flex-col p-6 sm:p-8 animate-in slide-in-from-bottom duration-400">
      <div className="p97-luxe-card p-4 flex justify-between items-center mb-10">
        <h2 className="p97-luxe-title text-base">{t.deactivationSos}</h2>
        <button onClick={onCancel} aria-label={t.close || 'Fermer'} style={{ color: 'var(--p97-text-3)' }} className="p-1.5 transition-colors hover:text-[var(--p97-text)]"><X size={22} /></button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <p className="text-sm mb-8" style={{ color: 'var(--p97-text-2)' }}>{t.enterPin}</p>
        <div className={`flex gap-5 mb-14 ${error ? 'animate-shake' : ''}`} role="status" aria-label={`${input.length}/4`}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="w-3.5 h-3.5 rounded-full border-2 transition-all duration-150"
              style={input.length > i
                ? error
                  ? { background: 'var(--p97-accent)', borderColor: 'var(--p97-accent)' }
                  : { background: 'var(--p97-text)', borderColor: 'var(--p97-text)', transform: 'scale(1.15)' }
                : { borderColor: 'var(--p97-line-strong)' }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4 w-full max-w-[276px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
            <button key={n} onClick={() => handlePress(n)} className="aspect-square flex items-center justify-center p97-luxe-card text-2xl font-medium active:scale-95 transition-all" style={{ color: 'var(--p97-text)' }}>{n}</button>
          ))}
          <div />
          <button onClick={() => handlePress('0')} className="aspect-square flex items-center justify-center p97-luxe-card text-2xl font-medium active:scale-95 transition-all" style={{ color: 'var(--p97-text)' }}>0</button>
          <button onClick={() => setInput(input.slice(0, -1))} aria-label="Effacer" className="aspect-square flex items-center justify-center rounded-full transition-colors" style={{ color: 'var(--p97-text-3)' }}><Delete size={26} /></button>
        </div>
      </div>
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } } .animate-shake { animation: shake 0.2s ease-in-out infinite; }`}</style>
    </div>
  );
};

export default PinPad;
