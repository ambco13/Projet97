
import React, { useEffect, useState, useRef } from 'react';
import { Phone, MapPin, Mic, Radio, Lock, Volume2, ShieldAlert, RefreshCw, AlertTriangle, Send, Share2, Bot, Sparkles } from 'lucide-react';
import { Contact } from '../types';
import MapView from './MapView';
import { GoogleGenAI } from "@google/genai";

interface Props {
  contacts: Contact[];
  language: string;
  onDeactivate: () => void;
  translations: any;
}

const EmergencyView: React.FC<Props> = ({ contacts, language, onDeactivate, translations: t }) => {
  const [seconds, setSeconds] = useState(0);
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);
  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const voiceTimerRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const startTracking = () => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.error(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const getAiAdvice = async (latitude: number, longitude: number) => {
    if (aiAdvice || isAiLoading) return;
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `L'utilisateur est en situation d'urgence SOS aux coordonnées ${latitude}, ${longitude}. Langue: ${language}. Donne 3 conseils de sécurité ultra-courts et percutants pour cette situation immédiate. Format: Liste courte.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { temperature: 0.7, maxOutputTokens: 150 }
      });
      
      setAiAdvice(response.text || "");
    } catch (err) {
      console.error("AI Error:", err);
      setAiAdvice("Restez calme. Cherchez un endroit éclairé. L'aide arrive.");
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (coords && !aiAdvice) {
      getAiAdvice(coords.lat, coords.lng);
    }
  }, [coords]);

  const shareLocation = async () => {
    if (!coords) return;
    const url = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
    const message = `${t.sosActive}! Location: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: t.sosActive, text: message, url: url });
      } catch (err) { sendSMSFallback(message); }
    } else { sendSMSFallback(message); }
  };

  const sendSMSFallback = (message: string) => {
    const phones = contacts.map(c => c.phone).join(',');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const smsUrl = isIOS ? `sms:${phones}&body=${encodeURIComponent(message)}` : `sms:${phones}?body=${encodeURIComponent(message)}`;
    window.location.href = smsUrl;
  };

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
          <div className="w-full h-48 bg-neutral-900 rounded-[2rem] border border-white/10 mb-4 overflow-hidden relative shadow-2xl shrink-0">
            {coords ? <MapView lat={coords.lat} lng={coords.lng} zoom={17} /> : <div className="w-full h-full flex items-center justify-center bg-neutral-950 text-[10px] font-black uppercase text-neutral-500">GPS...</div>}
          </div>

          <button disabled={!coords} onClick={shareLocation} className="w-full bg-red-600 text-white font-black py-5 rounded-[1.5rem] shadow-[0_0_30px_rgba(239,68,68,0.4)] flex flex-col items-center justify-center gap-0.5 mb-4 animate-bounce disabled:opacity-20 shrink-0">
            <div className="flex items-center gap-2"><Send size={18} /><span className="uppercase tracking-[0.2em] text-[11px]">{t.alertContacts}</span></div>
            <span className="text-[8px] opacity-60 uppercase font-black">{t.sendingLocation}</span>
          </button>

          {/* AI Guardian Section */}
          <div className="w-full bg-blue-600/10 border border-blue-500/20 rounded-[1.5rem] p-4 mb-4 backdrop-blur-md animate-in slide-in-from-bottom duration-1000">
             <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-blue-600 rounded-lg"><Bot size={14} className="text-white" /></div>
                <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{t.aiSafetyAdvice}</h3>
                {isAiLoading && <Sparkles size={12} className="text-blue-400 animate-spin" />}
             </div>
             {isAiLoading ? (
               <div className="space-y-2">
                 <div className="h-2 w-3/4 bg-blue-500/20 rounded animate-pulse"></div>
                 <div className="h-2 w-1/2 bg-blue-500/20 rounded animate-pulse"></div>
               </div>
             ) : (
               <p className="text-[11px] text-white/90 font-medium leading-relaxed">
                 {aiAdvice || t.aiAnalyzing}
               </p>
             )}
          </div>

          <div className="w-full bg-white/5 p-4 rounded-[1.5rem] border border-white/5 mb-4">
            <div className="flex items-center gap-3 mb-1.5">
              <Volume2 className="text-white/60" size={14} />
              <p className="text-white/60 font-black text-[9px] uppercase tracking-widest">{t.voiceDeterrence}</p>
            </div>
            <p className="text-neutral-400 text-[10px] font-medium leading-relaxed italic italic-red-selection">"{t.voiceMsg}"</p>
          </div>
        </div>

        <div className="mt-auto pt-2 shrink-0">
          <button onClick={onDeactivate} className="w-full bg-neutral-900/90 text-neutral-200 font-black py-4 rounded-[1.5rem] border border-white/5 flex items-center justify-center gap-3 transition-all active:scale-[0.98]">
            <Lock size={16} className="text-neutral-500" />
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
