
import React, { useRef, useState } from 'react';
import { Upload, AlertTriangle, FileAudio, BrainCircuit, RotateCcw, User, Phone, HelpCircle, UserCheck, Layers } from 'lucide-react';
import { analyzeAudioCall } from '../services/geminiService';
import { CallAnalysis, LeadType, RelationshipType } from '../types';
import { getCompanyKnowledge } from '../services/firebaseService';

interface FileUploadProps {
  onAnalysisComplete: (result: CallAnalysis) => void;
  agentName: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  onAnalysisComplete, 
  agentName
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Initializing Analysis...");
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientConcern, setClientConcern] = useState('');
  const [leadType, setLeadType] = useState<LeadType>(LeadType.NEW_LEAD);
  const [relationshipType, setRelationshipType] = useState<RelationshipType>(RelationshipType.LEAD);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!clientName.trim() || !clientPhone.trim() || !clientConcern.trim()) {
      setError("Please fill in all client details (Name, Number, Concern) before uploading.");
      return;
    }

    const supportedMimeTypes = [
      'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4', 'audio/aac', 'audio/x-aac', 'audio/flac', 'audio/x-flac', 'audio/x-ms-wma',
      'video/mp4', 'video/mpeg', 'video/x-m4v'
    ];
    const supportedExtensions = /\.(mp3|wav|m4a|mp4|mpeg|mpg|aac|flac|wma)$/i;

    if (!supportedMimeTypes.includes(file.type) && !file.name.match(supportedExtensions)) {
      setError("Unsupported format. Please upload Audio (MP3, WAV, M4A) or Video (MP4, MPEG) files.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatusMessage("Gathering context...");

    try {
      const knowledgeDoc = await getCompanyKnowledge() || undefined;
      
      // Intelligence context is stored in the 'rules' field of companyKnowledge document
      const instructions = knowledgeDoc && typeof knowledgeDoc.rules === 'string' ? knowledgeDoc.rules : '';
      
      setStatusMessage("Uploading and preparing media...");
      const result = await analyzeAudioCall(
        file, 
        agentName,
        {
          name: clientName,
          phone: clientPhone,
          concern: clientConcern,
          leadType,
          relationshipType
        }, 
        knowledgeDoc, 
        instructions,
        (status) => setStatusMessage(status)
      );
      
      onAnalysisComplete(result);
      setClientName('');
      setClientPhone('');
      setClientConcern('');
      setLeadType(LeadType.NEW_LEAD);
      setRelationshipType(RelationshipType.LEAD);
    } catch (err: any) {
      console.error("Analysis Failure:", err);
      let errorMessage = err instanceof Error ? err.message : "Failed to analyze media.";
      
      // Specific detection for Quota / 429 Errors
      const isQuotaError = 
        err.status === 429 || 
        errorMessage.includes("429") || 
        errorMessage.toLowerCase().includes("quota") || 
        errorMessage.toLowerCase().includes("exhausted");

      if (isQuotaError) {
        errorMessage = "API Daily Limit Reached...wait for some times.";
      }

      setError(errorMessage);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isQuotaRelated = error?.includes("Limit Reached") || error?.toLowerCase().includes("quota");

  return (
    <div className="">
      {error && (
        <div className="mb-6 p-6 bg-rose-50 border-2 border-rose-100 rounded-[2rem] text-rose-700 flex flex-col gap-4 fit-shadow animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6" />
            <span className="font-black text-lg">
              {isQuotaRelated ? "Service Limit" : "Analysis Blocked"}
            </span>
          </div>
          <p className="text-sm font-bold opacity-80">{error}</p>
          <button onClick={() => setError(null)} className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] bg-white text-[#0F172A] w-fit px-6 py-3 rounded-xl shadow-sm hover:fit-accent-shadow transition-all active:scale-95">
            <RotateCcw className="w-4 h-4" />
            Dismiss
          </button>
        </div>
      )}

      <div className={`mb-8 grid grid-cols-1 md:grid-cols-3 gap-6 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="space-y-2">
           <label className="text-[10px] font-black text-slate-800 uppercase tracking-widest ml-1">Client Name</label>
           <div className="relative">
             <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
             <input type="text" placeholder="e.g. Rahul Sharma" className="w-full pl-10 pr-4 py-4 bg-[#F8FAFC] border-2 border-dashed border-slate-200 rounded-2xl focus:border-[#20b384] focus:bg-white outline-none transition-all font-semibold text-sm text-[#0F172A]" value={clientName} onChange={(e) => setClientName(e.target.value)} />
           </div>
        </div>
        <div className="space-y-2">
           <label className="text-[10px] font-black text-slate-800 uppercase tracking-widest ml-1">Contact Number</label>
           <div className="relative">
             <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
             <input type="tel" placeholder="e.g. 9876543210" minLength={10} maxLength={10} className="w-full pl-10 pr-4 py-4 bg-[#F8FAFC] border-2 border-dashed border-slate-200 rounded-2xl focus:border-[#20b384] focus:bg-white outline-none transition-all font-semibold text-sm text-[#0F172A]" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
           </div>
        </div>
        <div className="space-y-2">
           <label className="text-[10px] font-black text-slate-800 uppercase tracking-widest ml-1">Enquiry Concern</label>
           <div className="relative">
             <HelpCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
             <input type="text" placeholder="e.g. Diabetes, Weight Loss" className="w-full pl-10 pr-4 py-4 bg-[#F8FAFC] border-2 border-dashed border-slate-200 rounded-2xl focus:border-[#20b384] focus:bg-white outline-none transition-all font-semibold text-sm text-[#0F172A]" value={clientConcern} onChange={(e) => setClientConcern(e.target.value)} />
           </div>
        </div>
        
        <div className="space-y-2 ">
           <label className="text-[10px] font-black text-slate-800 uppercase tracking-widest ml-1">Lead Type</label>
           <div className="relative">
             <Layers className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
             <select 
               className="w-full pl-10 pr-4 py-4 bg-[#F8FAFC] border-2 border-dashed border-slate-200 rounded-2xl focus:border-[#20b384] focus:bg-white outline-none transition-all font-semibold text-sm text-[#0F172A] appearance-none"
               value={leadType}
               onChange={(e) => setLeadType(e.target.value as LeadType)}
             >
               <option value={LeadType.NEW_LEAD}>New Lead</option>
               <option value={LeadType.OLD_LEAD}>Old Lead</option>
             </select>
           </div>
        </div>
        <div className="space-y-2 ">
           <label className="text-[10px] font-black text-slate-800 uppercase tracking-widest ml-1">Relationship</label>
           <div className="relative">
             <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
             <select 
               className="w-full pl-10 pr-4 py-4 bg-[#F8FAFC] border-2 border-dashed border-slate-200 rounded-2xl focus:border-[#20b384] focus:bg-white outline-none transition-all font-semibold text-sm text-[#0F172A] appearance-none"
               value={relationshipType}
               onChange={(e) => setRelationshipType(e.target.value as RelationshipType)}
             >
               <option value={RelationshipType.LEAD}>Lead</option>
               <option value={RelationshipType.CLIENT}>Client</option>
             </select>
           </div>
        </div>
      </div>

      <div 
        className={`relative border-2 border-dashed rounded-[3rem] p-4 transition-all duration-500 text-center ${isDragging ? 'border-[#20b384] bg-[#20b384]/5' : 'border-slate-200 hover:border-[#20b384]/40'} ${isProcessing ? 'opacity-90 pointer-events-none' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]); }}
      >
        <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} accept=".mp3,.wav,.m4a,.mp4,.mpeg,.mpg,.aac,.flac,.wma,audio/*,video/mp4,video/mpeg" className="hidden" />
        <div className="flex flex-col items-center justify-center space-y-8">
          {isProcessing ? (
            <div className="flex flex-col items-center">
              <div className="relative">
                <BrainCircuit className="w-20 h-20 text-[#20b384] animate-[spin_6s_linear_infinite]" />
              </div>
              <p className="font-black text-2xl text-[#0F172A] mt-8 tracking-tight">{statusMessage}</p>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] mt-2">Context-Aware Audit</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-2xl font-black text-[#0F172A] tracking-tight">Drop Call Recording</p>
                <p className="text-slate-400 font-bold text-sm mt-1 uppercase tracking-widest">Adjusted for {leadType.replace('_', ' ')}</p>
              </div>
              <button onClick={() => {
                   if (!clientName.trim() || !clientPhone.trim() || !clientConcern.trim()) {
                      setError("Please fill in all client details above before selecting a file.");
                      return;
                   }
                   fileInputRef.current?.click();
                }} className="px-12 py-5 fit-button-gradient text-white rounded-[1.5rem] font-black text-lg fit-accent-shadow flex items-center gap-4 hover:scale-105 transition-all">
                <Upload className="w-6 h-6" />
                Select File
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
