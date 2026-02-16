
import React, { useState, useEffect, useRef } from 'react';
import { Mic, Sparkles, MessageSquare, Smartphone, X, ShieldCheck, Headphones, Star, Loader2, BrainCircuit, FileSearch } from 'lucide-react';
import { startLiveCopilot, prepareLiveContext } from '../services/liveService';

interface LiveCopilotProps {
  knowledgeBase: string;
  pdfBase64List?: string[];
  onClose: () => void;
}

interface Suggestion {
  id: string;
  text: string;
  time: string;
  type: 'answer' | 'tip' | 'warning';
  reviewTag?: string;
}

export const LiveCopilot: React.FC<LiveCopilotProps> = ({ knowledgeBase, pdfBase64List = [], onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [transcript, setTranscript] = useState<{text: string, isModel: boolean, review?: string}[]>([]);
  const stopRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  const toggleSession = async () => {
    if (isActive) {
      stopRef.current?.();
      setIsActive(false);
    } else {
      setIsPreparing(true);
      setShowGuide(false);
      
      try {
        const digestedContext = await prepareLiveContext(pdfBase64List, knowledgeBase);
        
        const session = await startLiveCopilot({
          digestedContext,
          onTranscript: (text, isModel, review) => {
            setTranscript(prev => [...prev.slice(-20), { text, isModel, review }]);
          },
          onSuggestion: (text) => {
            if (!text.trim()) return;
            
            let reviewTag = undefined;
            const tagMatch = text.match(/\[(.*?)\]/);
            let cleanedText = text;
            if (tagMatch) {
              reviewTag = tagMatch[1];
              cleanedText = text.replace(/\[.*?\]/, '').trim();
            }

            setSuggestions(prev => [{
              id: Math.random().toString(),
              text: cleanedText,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              type: (text.toLowerCase().includes('caution') || text.toLowerCase().includes('wrong') || text.toLowerCase().includes('correction') ? 'warning' : 'answer') as 'warning' | 'answer',
              reviewTag
            }, ...prev].slice(0, 15));
          },
          onError: (err) => {
            console.error(err);
            setIsActive(false);
            alert(err);
          }
        });

        stopRef.current = session.stop;
        setIsActive(true);
      } catch (err) {
        console.error(err);
        alert("Microphone access denied or session failed.");
      } finally {
        setIsPreparing(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-6xl h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-white/10">
        
        <div className="bg-white border-b border-slate-100 p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${isActive ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-400'}`}>
              <Mic className={`w-5 h-5 ${isActive ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 leading-tight">Smart Live Copilot</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#20b384]' : 'bg-slate-300'}`} />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {isActive ? 'Session Live' : isPreparing ? 'Syncing...' : 'Ready'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col p-8 border-r border-slate-100 bg-slate-50/30 overflow-hidden">
            
            <div className="flex-1 flex flex-col items-center justify-center relative min-h-[250px]">
              {isPreparing ? (
                <div className="flex flex-col items-center">
                  <FileSearch className="w-10 h-10 text-amber-500 animate-pulse mb-4" />
                  <h3 className="text-xl font-bold text-slate-800">Digesting {pdfBase64List.length} PDF(s)...</h3>
                </div>
              ) : isActive ? (
                <div className="flex flex-col items-center">
                  <div className="w-40 h-40 bg-[#20b384] rounded-full flex items-center justify-center text-white shadow-2xl">
                    <Headphones className="w-16 h-16" />
                  </div>
                  <p className="mt-8 text-[#20b384] font-bold uppercase text-sm">Active Monitoring Layer Enabled</p>
                </div>
              ) : (
                <div className="text-center group">
                  <button onClick={toggleSession} className="px-14 py-6 bg-[#20b384] hover:bg-[#1a926d] text-white rounded-full font-bold text-2xl shadow-xl transition-all flex items-center gap-4">
                    <Mic className="w-7 h-7" />
                    Launch Smart Session
                  </button>
                </div>
              )}
            </div>

            <div className="h-64 mt-6 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conversation Feed</p>
                 <BrainCircuit className="w-3 h-3 text-[#20b384]" />
              </div>
              <div className="flex-1 overflow-y-auto pr-4 scroll-smooth" ref={scrollRef}>
                {transcript.map((t, i) => (
                  <div key={i} className="mb-3 text-sm flex items-start gap-3">
                    <span className="text-[#20b384] font-black text-[10px]">FEED:</span>
                    <span className="text-slate-600 font-medium italic">"{t.text}"</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="w-[420px] bg-white p-8 flex flex-col border-l border-slate-50">
            <h3 className="font-bold text-slate-800 text-xl mb-8 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Copilot Guidance
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              {suggestions.map((s) => (
                <div key={s.id} className={`p-6 rounded-[1.5rem] border-b-4 ${s.type === 'warning' ? 'bg-rose-50 border-rose-500' : 'bg-[#e4fff6] border-[#20b384]'} shadow-lg`}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${s.type === 'warning' ? 'bg-rose-100 text-rose-700' : 'bg-[#20b384] text-white'}`}>
                      {s.type === 'warning' ? 'Correction' : 'Insight'}
                    </span>
                    {s.reviewTag && <span className="text-[9px] font-black border px-2 py-0.5 rounded">{s.reviewTag}</span>}
                  </div>
                  <p className="text-lg text-slate-800 font-bold">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};