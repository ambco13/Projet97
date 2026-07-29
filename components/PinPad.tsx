
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
    <div className="fixed inset-0 z-[100] p97-page backdrop-blur-2xl flex flex-col p-8 sm:p-10 animate-in slide-in-from-bottom duration-500">
      <div className="p97-luxe-card rounded-[2rem] p-4 flex justify-between items-center mb-12"><h2 className="p97-luxe-title font-black uppercase tracking-widest text-sm">{t.deactivationSos}</h2><button onClick={onCancel} className="text-neutral-500 hover:text-white"><X size={24} /></button></div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <p className="text-neutral-500 text-xs font-bold uppercase mb-8 tracking-[0.2em]">{t.enterPin}</p>
        <div className={`flex gap-6 mb-16 ${error ? 'animate-shake' : ''}`}>{[0, 1, 2, 3].map(i => (<div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${input.length > i ? (error ? 'bg-red-500 border-red-500' : 'bg-white border-white scale-125') : 'border-neutral-800'}`} />))}</div>
        <div className="grid grid-cols-3 gap-6 w-full max-w-[280px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (<button key={n} onClick={() => handlePress(n)} className="aspect-square flex items-center justify-center rounded-[2rem] p97-luxe-card text-white text-2xl font-bold active:bg-white active:text-black active:scale-95 transition-all">{n}</button>))}
          <div /><button onClick={() => handlePress('0')} className="aspect-square flex items-center justify-center rounded-[2rem] p97-luxe-card text-white text-2xl font-bold active:bg-white active:text-black active:scale-95 transition-all">0</button>
          <button onClick={() => setInput(input.slice(0, -1))} className="aspect-square flex items-center justify-center rounded-full text-neutral-500 active:text-white transition-colors"><Delete size={28} /></button>
        </div>
      </div>
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } } .animate-shake { animation: shake 0.2s ease-in-out infinite; }`}</style>
    </div>
  );
};

export default PinPad;
