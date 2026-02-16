
import React from 'react';
import { CallAnalysis, TranscriptSegment, FeedbackItem } from '../types';
import {
  CheckCircle,
  XCircle,
  TrendingUp,
  Smile,
  Meh,
  Frown,
  Activity,
  ShieldAlert,
  Zap,
  ChevronRight,
  Info,
  Target,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Download
} from 'lucide-react';
import {
  PieChart, Pie, Cell
} from 'recharts';

interface AnalysisReportProps {
  analysis: CallAnalysis;
  onClose: () => void;
}

const SentimentIcon = ({ sentiment }: { sentiment: string }) => {
  const s = (sentiment || '').toLowerCase();
  if (s === 'positive' || s === 'professional') return <Smile className="text-[#20b384] w-5 h-5" />;
  if (s === 'negative' || s === 'aggressive' || s === 'frustrated') return <Frown className="text-rose-500 w-5 h-5" />;
  return <Meh className="text-amber-500 w-5 h-5" />;
};

const ScoreGauge = ({ score, label }: { score: number; label: string }) => {
  const data = [
    { name: 'Score', value: score },
    { name: 'Remaining', value: 100 - score },
  ];
  const COLORS = [score > 80 ? '#20b384' : score > 50 ? '#F59E0B' : '#E11D48', '#F1F5F9'];

  const chartSize = 96;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-[2rem] fit-shadow border border-slate-50">
      <div className="h-24 w-24 relative">
        <PieChart width={chartSize} height={chartSize}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={28}
            outerRadius={40}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index]} stroke="none" />
            ))}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-black text-[#0F172A]">{score}%</span>
        </div>
      </div>
      <span className="text-[10px] font-black text-slate-400 mt-3 text-center uppercase tracking-[0.2em]">{label}</span>
    </div>
  );
};

export const AnalysisReport: React.FC<AnalysisReportProps> = ({ analysis, onClose }) => {

  const handleDownload = () => {
    window.print();
  };

  const transcript = analysis.transcript || [];
  const strengths = analysis.feedback?.strengths || [];
  const weaknesses = analysis.feedback?.weaknesses || [];
  const actionableSteps = analysis.feedback?.actionableSteps || [];
  const missedOpportunities = analysis.feedback?.missedOpportunities || [];

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/80 backdrop-blur-xl overflow-y-auto py-10 px-6 flex justify-center items-start print:p-0 print:bg-white print:static print:overflow-visible">
      <div id="printable-report" className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-500 print:shadow-none print:rounded-none print:max-w-none">

        {/* Header */}
        <div className="bg-white border-b border-slate-100 p-10 flex justify-between items-center sticky top-0 z-10 print:static print:border-b-2">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 fit-button-gradient rounded-[1.5rem] flex items-center justify-center fit-accent-shadow print:shadow-none">
              <Target className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-[#0F172A] tracking-tight">Post-Call Audit</h2>
              <p className="text-slate-400 text-sm font-bold mt-1 uppercase tracking-widest">
                Expert: {analysis.agentName} • {analysis.uploadDate}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 print:hidden">
            <button
              onClick={handleDownload}
              className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 bg-[#F8FAFC] text-[#0F172A] border-2 border-slate-100 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-100 transition-all"
            >
              <Download className="w-4 h-4" />
              Download Report
            </button>

            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 bg-[#0F172A] text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-[#20b384] transition-all fit-shadow"
            >
              Close
            </button>
          </div>

        </div>

        <div className="bg-[#F8FAFC] p-10 print:bg-white">

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-10 print:grid-cols-5">
            <div className="md:col-span-1 fit-gradient rounded-[2.5rem] p-8 text-white fit-shadow flex flex-col justify-between print:shadow-none print:border print:border-slate-200">
              <div>
                <p className="text-[#20b384] font-black text-[10px] uppercase tracking-[0.2em] mb-2">Success Index</p>
                <h3 className="text-6xl font-black">{analysis.conversionScore}%</h3>
              </div>
              <div className="mt-6 flex items-center gap-3 text-[10px] bg-white/10 p-3 rounded-xl font-black uppercase tracking-widest backdrop-blur-sm print:bg-slate-100 print:text-slate-800">
                <TrendingUp className="w-4 h-4 text-[#20b384]" />
                <span>Conversion Odds</span>
              </div>
            </div>

            <ScoreGauge score={analysis.metrics?.productKnowledgeScore || 0} label="Plan Accuracy" />
            <ScoreGauge score={analysis.metrics?.persuasionScore || 0} label="Conviction" />
            <ScoreGauge score={analysis.metrics?.activeListeningScore || 0} label="Discovery" />
            <ScoreGauge score={analysis.metrics?.empathyScore || 0} label="EQ Rating" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 print:grid-cols-1">

            <div className="lg:col-span-2 space-y-10 print:col-span-1">

              {/* Verdict */}
              <div className="bg-white p-10 rounded-[2.5rem] fit-shadow border border-slate-50 relative overflow-hidden print:shadow-none print:border-2">
                <h3 className="font-black text-[#0F172A] text-xl mb-6 flex items-center gap-4">
                  <Activity className="w-6 h-6 text-[#20b384]" />
                  Blunt Verdict
                </h3>
                <p className="text-slate-600 leading-relaxed font-semibold text-lg italic">"{analysis.summary}"</p>

                <div className="flex flex-wrap gap-6 pt-10 border-t border-slate-50">
                  <div className="flex items-center gap-4 bg-[#F8FAFC] px-6 py-4 rounded-[1.5rem] print:border">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Client Vibe</span>
                    <div className="flex items-center gap-2">
                      <SentimentIcon sentiment={analysis.sentiment?.client || 'Neutral'} />
                      <span className="text-sm font-black text-[#0F172A]">{analysis.sentiment?.client || 'Neutral'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 bg-[#F8FAFC] px-6 py-4 rounded-[1.5rem] print:border">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expert Vibe</span>
                    <div className="flex items-center gap-2">
                      <SentimentIcon sentiment={analysis.sentiment?.responder || 'Professional'} />
                      <span className="text-sm font-black text-[#0F172A]">{analysis.sentiment?.responder || 'Professional'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transcript */}
              <div className="bg-white rounded-[3rem] fit-shadow border border-slate-50 overflow-hidden print:shadow-none print:border-2 print:rounded-none">
                <div className="p-8 border-b border-slate-50 bg-[#F8FAFC]/50 flex justify-between items-center print:bg-white">
                  <h3 className="font-black text-[#0F172A] text-xl">High-Fidelity Transcript</h3>
                  <div className="flex items-center gap-2 text-[10px] text-[#20b384] font-black uppercase tracking-[0.2em] print:hidden">
                    <Zap className="w-4 h-4 fill-[#20b384]" />
                    AI Monitored
                  </div>
                </div>
                <div className="max-h-[500px] overflow-y-auto p-10 space-y-10 print:max-h-none print:overflow-visible">
                  {transcript.map((seg, idx) => {
                    const isResponder = seg.speaker === 'Responder';
                    const displayName = isResponder ? analysis.agentName : (analysis.clientName || 'Client');
                    const sentimentLower = (seg.sentiment || seg.review || "").toLowerCase();
                    const isNegative = sentimentLower.includes('negative') || sentimentLower.includes('frustrat') || sentimentLower.includes('aggressive');

                    return (
                      <div
                        key={idx}
                        className={`flex gap-6 ${isResponder ? 'flex-row-reverse' : ''} print:flex-row print:gap-4`}
                      >
                        <div className={`w-12 h-12 rounded-[1.2rem] flex-shrink-0 flex items-center justify-center text-[10px] font-black shadow-lg overflow-hidden text-center leading-tight p-1 ${isResponder ? 'bg-[#0F172A] text-white' : 'fit-button-gradient text-white'} print:shadow-none print:border`}>
                          {displayName.substring(0, 2).toUpperCase()}
                        </div>
                        <div className={`max-w-[85%] p-6 rounded-[2rem] relative shadow-sm border-2 ${isResponder ? 'bg-[#F8FAFC] border-[#0F172A]/5 rounded-tr-none' : 'bg-white border-slate-50 rounded-tl-none'} print:max-w-none print:rounded-none print:shadow-none print:border`}>
                          <div className="flex justify-between items-center mb-3 gap-6">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{displayName}</span>
                            <div className="flex items-center gap-3">
                              {seg.review && (
                                <span className={`${(isResponder && isNegative) ? 'bg-rose-500' : 'bg-[#0F172A]'} text-white text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-widest print:text-black print:bg-transparent print:border print:border-black`}>
                                  {seg.review}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-300 font-black">{seg.timestamp}</span>
                            </div>
                          </div>
                          <p className="text-[#0F172A] text-base leading-relaxed font-semibold">{seg.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Strengths and Weaknesses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2">
                <div className="bg-white p-8 rounded-[2.5rem] fit-shadow border-2 border-green-50 print:shadow-none print:border-green-200">
                  <h3 className="font-black text-[#20b384] text-lg mb-6 flex items-center gap-3 uppercase tracking-wider">
                    <ThumbsUp className="w-5 h-5" />
                    Strengths
                  </h3>
                  <ul className="space-y-4">
                    {strengths.map((point, i) => (
                      <li key={i} className="flex gap-4">
                        <CheckCircle className="w-5 h-5 text-[#20b384] flex-shrink-0 mt-0.5" />
                        <span className="text-sm font-bold text-slate-700 leading-snug">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] fit-shadow border-2 border-rose-50 print:shadow-none print:border-rose-200">
                  <h3 className="font-black text-rose-500 text-lg mb-6 flex items-center gap-3 uppercase tracking-wider">
                    <ThumbsDown className="w-5 h-5" />
                    Weaknesses
                  </h3>
                  <ul className="space-y-4">
                    {weaknesses.map((point, i) => (
                      <li key={i} className="flex gap-4">
                        <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm font-bold text-slate-700 leading-snug">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

            </div>

            {/* Sidebar */}
            <div className="space-y-10 print:col-span-1">

              {/* Compliance */}
              <div className="bg-white p-10 rounded-[2.5rem] fit-shadow border border-slate-50 print:shadow-none print:border-2">
                <h3 className="font-black text-[#0F172A] text-xl mb-8 flex items-center gap-4">
                  <ShieldAlert className="w-6 h-6 text-[#20b384]" />
                  Protocol Logic
                </h3>

                <div className="space-y-5">
                  {[
                    {
                      label: 'DM Verified',
                      value: analysis.compliance?.dmVerified,
                      desc: 'Decision maker confirmed',
                    },
                    {
                      label: 'Pain Discovery',
                      value: analysis.compliance?.needDiscovery,
                      desc: 'Customer pain identified',
                    },
                    {
                      label: 'Accurate Pricing',
                      value: analysis.compliance?.priceAdherence,
                      desc: 'Pricing followed company policy',
                    },
                    {
                      label: 'Objection Nullified',
                      value: analysis.compliance?.objectionHandled,
                      desc: 'Objections handled clearly',
                    },
                    {
                      label: 'Hard Close Logged',
                      value: analysis.compliance?.hardCloseAttempted,
                      desc: 'Clear deal closing attempt made',
                    },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between">

                      {/* LABEL (hover target) */}
                      <span className="relative group inline-block text-sm font-black text-slate-500 border-b border-dotted border-slate-300 pb-0.5 cursor-help">
                        {item.label}

                        {/* Plain description */}
                        <span className="
                      absolute left-0 top-full mt-1
                      hidden group-hover:block
                      text-xs text-slate-500
                      whitespace-nowrap
                    ">
                          {item.desc}
                        </span>
                      </span>

                      {/* Icon */}
                      {item.value ? (
                        <CheckCircle className="text-[#20b384] w-6 h-6" />
                      ) : (
                        <XCircle className="text-[#E11D48] w-6 h-6" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Missed Opportunities */}
              {missedOpportunities.length > 0 && (
                <div className="bg-white p-10 rounded-[2.5rem] fit-shadow border border-slate-50 print:shadow-none print:border-2">
                  <h3 className="font-black text-[#0F172A] text-xl mb-8 flex items-center gap-4">
                    <AlertCircle className="w-6 h-6 text-amber-500" />
                    Missed Opportunities
                  </h3>
                  <div className="space-y-4">
                    {missedOpportunities.map((opportunity, i) => (
                      <div key={i} className="flex gap-4 p-5 bg-amber-50/20 rounded-2xl border border-amber-100/30">
                        <p className="text-sm font-bold text-slate-700 leading-snug italic">"{opportunity}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Coaching */}
              <div className="bg-white p-10 rounded-[3rem] fit-shadow border-2 border-[#20b384]/10 print:shadow-none print:border-2">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black text-xl flex items-center gap-4 text-[#0F172A]">
                    <Zap className="w-6 h-6 text-[#20b384] fill-[#20b384]" />
                    Expert Correction
                  </h3>
                </div>

                <div className="space-y-5">
                  {actionableSteps.map((item, idx) => (
                    <div key={idx} className={`p-6 rounded-[2rem] border-2 transition-all ${item.priority === 'High'
                        ? 'bg-rose-50/30 border-rose-100'
                        : 'bg-[#F8FAFC] border-slate-50'
                      } print:bg-transparent print:border-2`}>
                      <div className="flex justify-between items-start mb-4">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${item.priority === 'High' ? 'bg-[#E11D48] text-white' : 'bg-slate-200 text-slate-600'
                          } print:text-black print:bg-transparent print:border print:border-black`}>
                          {item.priority} ALERT
                        </span>
                        <span className="text-[10px] text-slate-400 font-black">{item.timestamp}</span>
                      </div>

                      <div className="flex items-start gap-4">
                        <ChevronRight className={`w-5 h-5 flex-shrink-0 mt-0.5 ${item.priority === 'High' ? 'text-[#E11D48]' : 'text-slate-400'}`} />
                        <p className={`text-base font-normal leading-tight ${item.priority === 'High' ? 'text-[#0F172A]' : 'text-slate-800'}`}>
                          {item.suggestion}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
