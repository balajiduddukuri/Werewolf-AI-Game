import React, { useEffect, useRef, useState } from 'react';
import { LogEntry, Phase } from '../types';
import { Volume2, Loader2, VolumeX } from 'lucide-react';
import { generateSpeech } from '../services/geminiService';
import { playRawAudio } from '../services/audioService';

interface GameLogProps {
  logs: LogEntry[];
  /** If true, the game automatically reads out new 'narrative' logs */
  autoNarrate: boolean;
  /** Callback to toggle the autoNarrate preference */
  onToggleAutoNarrate: () => void;
}

/**
 * Renders the persistent game log (chat, narrative, actions).
 * Handles auto-scrolling to the latest entry and managing Audio playback.
 */
const GameLog: React.FC<GameLogProps> = ({ logs, autoNarrate, onToggleAutoNarrate }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  /**
   * Triggers manually playing a log entry via TTS.
   */
  const handlePlayAudio = async (text: string, id: string) => {
    if (playingId) return;
    setPlayingId(id);
    try {
      const base64Audio = await generateSpeech(text);
      if (base64Audio) {
        await playRawAudio(base64Audio);
      }
    } catch (e) {
      console.error("Audio play failed", e);
    } finally {
      setPlayingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700/50 backdrop-blur-sm">
      <div className="p-3 bg-slate-800 border-b border-slate-700 font-cinzel text-slate-300 text-sm tracking-wider flex justify-between items-center">
        <span>Game Chronicle</span>
        <button 
          onClick={onToggleAutoNarrate}
          className={`flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-1 rounded-full border transition-all ${
            autoNarrate 
              ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/50 hover:bg-emerald-900' 
              : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'
          }`}
          title="Toggle Auto-Narration"
        >
          {autoNarrate ? <Volume2 size={12} /> : <VolumeX size={12} />}
          {autoNarrate ? 'Auto On' : 'Auto Off'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {logs.map((log) => (
          <div 
            key={log.id} 
            className={`flex flex-col animate-fadeIn ${
              log.type === 'narrative' ? 'items-center text-center my-4' : 'items-start'
            }`}
          >
            {/* Narrative / System Messages */}
            {log.type === 'narrative' && (
              <div className="flex flex-col items-center gap-2 max-w-full group">
                 <div className="text-yellow-500/80 italic font-serif text-sm px-4">
                  "{log.text}"
                 </div>
                 <button 
                  onClick={() => handlePlayAudio(log.text, log.id)}
                  disabled={playingId !== null}
                  className="text-slate-600 hover:text-yellow-400 transition-colors opacity-0 group-hover:opacity-100"
                  title="Read aloud"
                 >
                   {playingId === log.id ? <Loader2 size={12} className="animate-spin"/> : <Volume2 size={12} />}
                 </button>
              </div>
            )}
            {log.type === 'system' && (
               <div className="w-full text-center text-xs text-slate-500 font-mono border-t border-slate-800 pt-2 mt-2">
                --- {log.text} ---
              </div>
            )}

            {/* Chat / Action Messages */}
            {log.type === 'chat' && (
              <div className="flex gap-2 max-w-[90%]">
                <span className="font-bold text-xs text-blue-400 whitespace-nowrap pt-1">
                  {log.source}:
                </span>
                <div className="bg-slate-800/80 p-2 rounded-r-lg rounded-bl-lg text-sm text-slate-200 shadow-sm">
                  {log.text}
                </div>
              </div>
            )}
             {log.type === 'action' && (
               <div className="text-xs text-red-400 font-bold ml-2">
                 * {log.source} {log.text} *
               </div>
             )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default GameLog;