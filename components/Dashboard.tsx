
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, UserRole, CallAnalysis, KnowledgeBase, ResponderFeedback } from '../types';
import { FileUpload } from './FileUpload';
import { AnalysisReport } from './AnalysisReport';
import { LiveCopilot } from './LiveCopilot';
import { GoogleGenAI } from "@google/genai";
import { marked } from 'marked';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  db, collection, query, getDocs, setDoc, doc, serverTimestamp, callAnalysisConverter, updateCallReportDeletedStatus, where, deleteDoc, saveCompanyKnowledge, saveResponderFeedback, orderBy, getUnverifiedUsers, verifyUser, rejectUser,
  saveAdminRules, getAdminRules, getKnowledgeBases, addKnowledgeBaseToFirestore, removeKnowledgeBaseFromFirestore
} from '../services/firebaseService';
import {
  Loader2, Save, Bot,BotMessageSquare, Database, Sparkles, Zap, Trash2, CheckCircle, AlertCircle, Upload, BookOpen, History, Users, Calendar, Clock, ChevronRight, ArrowLeft, Send, MessageSquare, Filter, Bell, X
} from 'lucide-react';
import { convertPdfToKnowledgeJson } from '../services/geminiService';

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [selectedCall, setSelectedCall] = useState<CallAnalysis | null>(null);
  const [recentUploads, setRecentUploads] = useState<CallAnalysis[]>([]);
  const [kbError, setKbError] = useState<string | null>(null);
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [instructions, setInstructions] = useState<string>('');
  const [isKbUploading, setIsKbUploading] = useState(false);
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'Today' | 'Week' | 'Month'>('Today');
  const [selectedSentiment, setSelectedSentiment] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState<Record<string, string>>({});
  const [adminFeedbackList, setAdminFeedbackList] = useState<ResponderFeedback[]>([]);

  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Admin Approval State
  const [unverifiedUsers, setUnverifiedUsers] = useState<User[]>([]);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  // Mobile Back Button Management
  const prevOverlayRef = useRef(false);
  useEffect(() => {
    const isOverlayOpen = !!(selectedCall || isLiveActive || selectedAgentId || selectedSentiment || showApprovalModal);
    
    // Push state when an overlay opens
    if (isOverlayOpen && !prevOverlayRef.current) {
      window.history.pushState({ isDashboardOverlay: true }, "");
    } 
    // Go back if overlay was closed via UI (and we pushed a state)
    else if (!isOverlayOpen && prevOverlayRef.current && window.history.state?.isDashboardOverlay) {
      window.history.back();
    }

    const handlePopState = () => {
      setSelectedCall(null);
      setIsLiveActive(false);
      setSelectedAgentId(null);
      setSelectedSentiment(null);
      setShowApprovalModal(false);
    };

    window.addEventListener("popstate", handlePopState);
    prevOverlayRef.current = isOverlayOpen;
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectedCall, isLiveActive, selectedAgentId, selectedSentiment, showApprovalModal]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);


  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;

      try {
        // Load Intelligence Context (Rules) from Firestore
        const rules = await getAdminRules();
        setInstructions(rules);

        // Load Knowledge Bases from Firestore
        const files = await getKnowledgeBases();
        setKbList(files);

        // Fetch Call Reports
        const baseCollection = collection(db, 'callReports').withConverter(callAnalysisConverter);
        let callReportsQuery;

        if (user.role === UserRole.RESPONDER) {
          callReportsQuery = query(
            baseCollection,
            where('agentId', '==', user.id)
          );
        } else {
          callReportsQuery = query(baseCollection);
        }

        const querySnapshot = await getDocs(callReportsQuery);
        let reports: CallAnalysis[] = [];
        querySnapshot.forEach((doc) => {
          reports.push(doc.data() as CallAnalysis);
        });

        if (user.role === UserRole.RESPONDER) {
          reports = reports.filter(report => report.deletedByResponder === false);
        }

        reports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setRecentUploads(reports);

        // If Responder, fetch Feedback from Admin
        if (user.role === UserRole.RESPONDER) {
          const feedbackQuery = query(
            collection(db, 'responderFeedback'),
            where('responderId', '==', user.id),
            orderBy('createdAt', 'desc')
          );
          const feedbackSnap = await getDocs(feedbackQuery);
          const feedback: ResponderFeedback[] = [];
          feedbackSnap.forEach(doc => {
            feedback.push({ id: doc.id, ...doc.data() } as ResponderFeedback);
          });
          setAdminFeedbackList(feedback);
        }

        // Admin: Load unverified users
        if (user.role === UserRole.ADMIN) {
          const users = await getUnverifiedUsers();
          setUnverifiedUsers(users);
        }
      } catch (error) {
        console.error("Dashboard data load error:", error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadData();
  }, [user.id, user.name, user.role]);

  const handleAnalysisComplete = async (result: CallAnalysis) => {
    if (user?.id) {
      const callReportToSave: CallAnalysis = {
        ...result,
        agentId: user.id,
        agentName: user.name,
        createdAt: new Date(),
        deletedByResponder: false,
      };

      try {
        await setDoc(doc(db, 'callReports', callReportToSave.id), {
          ...callReportToSave,
          createdAt: serverTimestamp(),
        });
        setRecentUploads(prev => [callReportToSave, ...prev].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
      } catch (error) {
        console.error("Error saving call analysis to Firestore:", error);
        alert("Report generated but failed to save to server. Check permissions.");
      }
    }
    setSelectedCall(result);
  };

  const filteredCallsForMetrics = useMemo(() => {
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return recentUploads.filter(call => {
      const callDate = call.createdAt;
      if (timeFilter === 'Today') return callDate >= startOfToday;
      if (timeFilter === 'Week') return callDate >= weekAgo;
      if (timeFilter === 'Month') return callDate >= monthAgo;
      return true;
    });
  }, [recentUploads, timeFilter]);

  const metricsStats = useMemo(() => {
    return {
      total: filteredCallsForMetrics.length,
      positive: filteredCallsForMetrics.filter(c => c.sentiment?.client === 'Positive').length,
      neutral: filteredCallsForMetrics.filter(c => c.sentiment?.client === 'Neutral').length,
      negative: filteredCallsForMetrics.filter(c => c.sentiment?.client === 'Negative').length,
    };
  }, [filteredCallsForMetrics]);

  const agentsBySentiment = useMemo(() => {
    if (!selectedSentiment) return [];
    const agents: Record<string, { id: string, name: string, count: number }> = {};
    filteredCallsForMetrics.filter(c => c.sentiment?.client === selectedSentiment).forEach(call => {
      if (!agents[call.agentId]) {
        agents[call.agentId] = { id: call.agentId, name: call.agentName, count: 0 };
      }
      agents[call.agentId].count++;
    });
    return Object.values(agents);
  }, [filteredCallsForMetrics, selectedSentiment]);

  const adminAgentStats = useMemo(() => {
    if (user.role !== UserRole.ADMIN) return [];

    const stats: Record<string, {
      agentId: string;
      agentName: string;
      totalCalls: number;
      totalScore: number;
      reports: CallAnalysis[]
    }> = {};

    recentUploads.forEach(report => {
      const key = report.agentId || 'unknown';
      if (!stats[key]) {
        stats[key] = {
          agentId: key,
          agentName: report.agentName || 'Unknown Agent',
          totalCalls: 0,
          totalScore: 0,
          reports: []
        };
      }
      stats[key].totalCalls += 1;
      stats[key].totalScore += report.conversionScore;
      stats[key].reports.push(report);
    });

    return Object.values(stats).map(stat => ({
      ...stat,
      agentId: stat.agentId,
      agentName: stat.agentName,
      totalCalls: stat.totalCalls,
      totalScore: stat.totalScore,
      reports: stat.reports,
      averageScore: Math.round(stat.totalScore / stat.totalCalls)
    })).sort((a, b) => b.averageScore - a.averageScore);
  }, [recentUploads, user.role]);

  const chartData = useMemo(() => {
    return adminAgentStats.map(stat => ({
      name: stat.agentName.split(' ')[0],
      score: stat.averageScore
    }));
  }, [adminAgentStats]);

  const selectedAgentData = useMemo(() => {
    return adminAgentStats.find(a => a.agentId === selectedAgentId);
  }, [adminAgentStats, selectedAgentId]);

  const displayReports = useMemo(() => {
    let reports = selectedAgentData?.reports || [];
    if (selectedSentiment) {
      reports = reports.filter(r => r.sentiment?.client === selectedSentiment);
    }
    return reports;
  }, [selectedAgentData, selectedSentiment]);

  const handleSaveInstructions = async () => {
    setIsSavingInstructions(true);
    try {
      await saveAdminRules(instructions);
    } catch (err) {
      alert("Failed to save rules to Firestore.");
    } finally {
      setIsSavingInstructions(false);
    }
  };

  const handleKbUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKbError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsKbUploading(true);

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const knowledgeJson = await convertPdfToKnowledgeJson(base64);
          await saveCompanyKnowledge(knowledgeJson, file.name);

          const kbData: KnowledgeBase = {
            id: crypto.randomUUID(),
            fileName: file.name,
            url: base64,
            uploadedAt: new Date().toLocaleString()
          };
          
          await addKnowledgeBaseToFirestore(kbData);
          const updatedList = await getKnowledgeBases();
          setKbList(updatedList);
        } catch (err: any) {
          setKbError(err.message || "Failed to process PDF.");
        } finally {
          setIsKbUploading(false);
          if (e.target) e.target.value = '';
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFeedbackSubmit = async (agentId: string) => {
    const text = feedbackText[agentId];
    if (!text?.trim()) return;
    try {
      await saveResponderFeedback(agentId, text);
      setFeedbackText(prev => ({ ...prev, [agentId]: '' }));
      alert("Feedback sent successfully.");
    } catch (err) {
      alert("Error sending feedback.");
    }
  };

  const handleDeleteCallReport = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to remove this audit?")) return;

    try {
      if (user.role === UserRole.RESPONDER) {
        await updateCallReportDeletedStatus(user.id, reportId, true);
      } else if (user.role === UserRole.ADMIN) {
        await deleteDoc(doc(db, 'callReports', reportId));
      }
      setRecentUploads(prev => prev.filter(report => report.id !== reportId));
    } catch (err) {
      alert("Only Admin can remove this report.");
    }
  };

  const handleApproveUser = async (userId: string) => {
    try {
      await verifyUser(userId);
      setUnverifiedUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      alert("Approval failed.");
    }
  };

  const handleRejectUser = async (userId: string) => {
    if (!window.confirm("Reject and delete this responder signup?")) return;
    try {
      await rejectUser(userId);
      setUnverifiedUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      alert("Rejection failed.");
    }
  };

  if (!isLoaded) return (
    <div className="h-screen flex items-center justify-center bg-[#e4fff6]">
      <Loader2 className="animate-spin text-[#20b384] w-12 h-12" />
    </div>
  );

  return (
    <div className="min-h-screen pb-20 bg-[url('https://drive.google.com/thumbnail?id=1zn30llLoJYTW3PpENoYDBKNnc_1nOiCv&sz=w1920')] bg-cover bg-center bg-no-repeat bg-fixed">
      <nav className="bg-white border-b border-slate-100 h-20 sticky top-0 z-20 fit-shadow">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://drive.google.com/thumbnail?id=16XO82w7ZH4aMFYzHrTB-f5lKxFapwUw-&sz=w300"
              alt="Fit Mantra Logo"
              className="w-16 h-16 shadow-2xl object-contain bg-white rounded-full"
            />
            <div className="flex flex-col">
              <span className="font-black text-xl tracking-tighter text-[#0F172A] leading-none">CallSense</span>
              <span className="text-[10px] font-black text-[#20b384] uppercase tracking-[0.2em] mt-1">~Fit Mantra</span>
            </div>
          </div>
          <div className="flex items-center gap-8">
            {user.role === UserRole.ADMIN && (
              <button 
                onClick={() => setShowApprovalModal(true)} 
                className="relative p-2 text-slate-400 hover:text-[#20b384] transition-colors"
              >
                <Bell className="w-6 h-6" />
                {unverifiedUsers.length > 0 && (
                  <span className="absolute top-0 right-0 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce">
                    {unverifiedUsers.length}
                  </span>
                )}
              </button>
            )}
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-black text-[#0F172A]">{user.name}</span>
              <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{user.role}</span>
            </div>
            <button onClick={onLogout} className="text-[10px] font-black text-[#0F172A] uppercase tracking-widest hover:text-[#20b384] transition-colors bg-[#F8FAFC] px-5 py-3 rounded-xl border border-slate-100">Logout</button>
          </div>
        </div>
      </nav>

      {/* Admin Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] fit-shadow overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <h3 className="font-black text-[#0F172A] text-xl">Pending Approvals</h3>
              <button onClick={() => setShowApprovalModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {unverifiedUsers.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No pending requests</p>
                </div>
              ) : (
                unverifiedUsers.map(u => (
                  <div key={u.id} className="p-6 bg-[#F8FAFC] rounded-2xl flex items-center justify-between gap-4 border border-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-[#0F172A] truncate">{u.name}</p>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest truncate">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleApproveUser(u.id)} className="p-2 bg-[#20b384]/10 text-[#20b384] rounded-xl hover:bg-[#20b384] hover:text-white transition-all"><CheckCircle className="w-5 h-5" /></button>
                      <button onClick={() => handleRejectUser(u.id)} className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all"><X className="w-5 h-5" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 mt-10 ">
        {user.role.includes("ADMIN") ? (
          <div className="space-y-8 animate-in fade-in duration-700">
            {/* Admin Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-3xl fit-shadow border border-slate-50 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Calls Analyzed</p>
                  <p className="text-4xl font-black text-[#0F172A]">{metricsStats.total}</p>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  {['Today', 'Week', 'Month'].map(f => (
                    <button
                      key={f}
                      onClick={() => setTimeFilter(f as any)}
                      className={`px-3 py-1 text-[9px] font-black rounded-lg transition-all ${timeFilter === f ? 'bg-[#20b384] text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div onClick={() => setSelectedSentiment('Positive')} className="bg-white p-6 rounded-3xl fit-shadow border-2 border-transparent hover:border-[#20b384]/20 cursor-pointer transition-all flex flex-col justify-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Hot</p>
                <p className="text-4xl font-black text-[#20b384]">{metricsStats.positive}</p>
              </div>
              <div onClick={() => setSelectedSentiment('Neutral')} className="bg-white p-6 rounded-3xl fit-shadow border-2 border-transparent hover:border-amber-500/20 cursor-pointer transition-all flex flex-col justify-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Warm</p>
                <p className="text-4xl font-black text-amber-500">{metricsStats.neutral}</p>
              </div>
              <div onClick={() => setSelectedSentiment('Negative')} className="bg-white p-6 rounded-3xl fit-shadow border-2 border-transparent hover:border-rose-500/20 cursor-pointer transition-all flex flex-col justify-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cold</p>
                <p className="text-4xl font-black text-rose-500">{metricsStats.negative}</p>
              </div>
            </div>

            {/* Sales Team Performance */}
            <div className="bg-white p-10 rounded-[3rem] fit-shadow border border-slate-50 min-h-[500px] overflow-hidden">
              {selectedSentiment && !selectedAgentId ? (
                <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                  <div className="flex items-center gap-6 mb-10">
                    <button onClick={() => setSelectedSentiment(null)} className="w-12 h-12 rounded-2xl bg-[#F8FAFC] flex items-center justify-center hover:bg-[#0F172A] hover:text-white transition-all shadow-sm">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h3 className="text-2xl font-[600] text-[#0F172A]">Responders with {selectedSentiment} Sentiment</h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {agentsBySentiment.map((agent) => (
                      <div key={agent.id} onClick={() => setSelectedAgentId(agent.id)} className="bg-white border-2 border-slate-50 rounded-[2.5rem] p-8 hover:border-[#20b384]/30 hover:shadow-xl transition-all cursor-pointer group">
                        <p className="font-black text-[#0F172A] text-lg mb-2">{agent.name}</p>
                        <p className="text-xs font-black text-[#20b384] uppercase tracking-widest">{agent.count} Calls</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : !selectedAgentId ? (
                <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                  <div className="flex items-center gap-4 mb-10">
                    <div className="p-3 bg-[#F8FAFC] rounded-2xl"><Users className="w-8 h-8 text-[#0F172A]" /></div>
                    <div>
                      <h3 className="text-2xl font-[600] text-[#0F172A]">Sales Team Performance</h3>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Active Responders Overview</p>
                    </div>
                  </div>
                  {adminAgentStats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                      <History className="w-16 h-16 mb-4 opacity-20" />
                      <p className="font-bold text-sm">No sales data available yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      {adminAgentStats.map((agent) => (
                        <div key={agent.agentId} onClick={() => setSelectedAgentId(agent.agentId)} className="bg-white border-2 border-slate-50 rounded-[2.5rem] p-8 hover:border-[#20b384]/30 hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden">
                          <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shadow-md">
                              {agent.agentName.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-black text-[#0F172A] text-lg leading-tight line-clamp-1">{agent.agentName}</span>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{agent.totalCalls} Audits</span>
                            </div>
                          </div>
                          <div className="flex items-baseline gap-1 mb-2">
                            <span className={`text-4xl font-black ${agent.averageScore >= 70 ? 'text-[#20b384]' : agent.averageScore >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>{agent.averageScore}%</span>
                            <span className="text-xs font-bold text-slate-400">avg. score</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${agent.averageScore >= 70 ? 'bg-[#20b384]' : agent.averageScore >= 50 ? 'bg-amber-500' : 'bg-rose-50'}`} style={{ width: `${agent.averageScore}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-6">
                      <button onClick={() => setSelectedAgentId(null)} className="w-12 h-12 rounded-2xl bg-[#F8FAFC] flex items-center justify-center hover:bg-[#0F172A] hover:text-white transition-all shadow-sm">
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div>
                        <h3 className="text-2xl font-black text-[#0F172A]">{selectedAgentData?.agentName}</h3>
                        {selectedSentiment && <span className="text-[10px] font-black text-[#20b384] uppercase tracking-widest">Filtering by {selectedSentiment} Sentiment</span>}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {displayReports.map((report) => (
                      <div key={report.id} onClick={() => setSelectedCall(report)} className="group bg-[#F8FAFC] hover:bg-white border-2 border-transparent hover:border-[#20b384]/20 rounded-3xl p-6 cursor-pointer transition-all flex items-center gap-6 hover:shadow-lg hover:translate-x-1">
                        <div className={`w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-lg ${report.conversionScore >= 70 ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>{report.conversionScore}%</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="font-black text-[#0F172A] text-lg truncate">{report.clientName || 'Unknown Client'}</span>
                            <span className="text-[9px] text-slate-400 font-bold bg-white/50 px-2 py-0.5 rounded flex items-center gap-1.5 border">
                              <Calendar className="w-3 h-3" /> {report.createdAt.toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${report.sentiment.client === 'Positive' ? 'bg-green-100 text-green-700' : report.sentiment.client === 'Negative' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                  }`}>
                                  {report.sentiment.client}
                                </span>
                                <span className="text-[10px] font-black text-[#20b384] bg-[#20b384]/10 px-2 py-1 rounded-lg uppercase tracking-tight border border-[#20b384]/10">
                                  {/* Fix: Changed 'report' to 'call' which is correctly scoped within this map function */}
                                  {report.clientConcern || 'General Query'}
                                </span>
                          </div>
                        </div>
                        <button onClick={(e) => handleDeleteCallReport(e, report.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                            <Trash2 className="w-5 h-5" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-slate-300" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-12 p-10 bg-[#F8FAFC] rounded-[2.5rem] border-2 border-slate-50">
                    <h4 className="font-black text-[#0F172A] text-lg mb-4 flex items-center gap-3"><MessageSquare className="w-5 h-5 text-[#20b384]" /> Direct Feedback</h4>
                    <textarea value={feedbackText[selectedAgentId] || ''} onChange={(e) => setFeedbackText(prev => ({ ...prev, [selectedAgentId]: e.target.value }))} placeholder="Type professional guidance..." className="w-full h-40 p-6 bg-white border-2 border-transparent focus:border-[#20b384]/20 rounded-3xl outline-none text-sm font-medium leading-relaxed transition-all resize-none shadow-sm mb-6" />
                    <button onClick={() => handleFeedbackSubmit(selectedAgentId)} className="flex items-center gap-3 px-10 py-5 bg-[#0F172A] text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#20b384] transition-all fit-shadow"><Send className="w-4 h-4" /> Dispatch Feedback</button>
                  </div>
                </div>
              )}
            </div>

            {/* Analytics Chart */}
            <div className="bg-white p-8 rounded-[2.5rem] fit-shadow border border-slate-50">
              <h3 className="text-xl font-black text-[#0F172A] mb-8 flex items-center gap-3"><Sparkles className="w-5 h-5 text-[#20b384]" /> Performance Overview</h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} cursor={{ fill: '#F8FAFC' }} />
                    <Bar dataKey="score" radius={[10, 10, 0, 0]}>
                      {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.score >= 70 ? '#20b384' : entry.score >= 50 ? '#F59E0B' : '#0F172A'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-white p-8 rounded-[2.5rem] fit-shadow border border-slate-50">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black text-[#0F172A] flex items-center gap-3"><BookOpen className="w-6 h-6 text-[#20b384]" /> Intelligence Context</h3>
                    <button onClick={handleSaveInstructions} disabled={isSavingInstructions} className="flex items-center gap-2 px-8 py-4 fit-button-gradient text-white rounded-2xl text-xs font-black uppercase tracking-widest fit-accent-shadow disabled:opacity-50 transition-all active:scale-95">{isSavingInstructions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Sync Model</button>
                  </div>
                  <textarea className="w-full h-80 p-6 bg-[#F8FAFC] border-2 border-transparent focus:border-[#20b384]/20 focus:bg-white rounded-[1.5rem] outline-none text-sm text-[#0F172A] font-medium leading-relaxed transition-all resize-none shadow-inner" placeholder="Sales philosophy..." value={instructions} onChange={(e) => setInstructions(e.target.value)} />
                </div>
              </div>
              <div className="space-y-8">
                <div className="bg-white p-8 rounded-[2.5rem] fit-shadow border border-slate-50">
                  <h3 className="font-black text-[#0F172A] text-lg mb-6 flex items-center gap-3"><Database className="w-6 h-6 text-blue-600" /> Reference Assets</h3>
                  {kbError && <div className="mb-6 p-4 bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-3 border border-rose-100"><AlertCircle className="w-4 h-4" /> {kbError}</div>}
                  <div className="space-y-3 mb-6">
                    {kbList.map((kb) => (
                      <div key={kb.id} className="p-4 bg-[#F8FAFC] rounded-2xl border border-slate-50 group hover:border-[#20b384]/30 transition-all flex items-center justify-between">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <CheckCircle className="w-5 h-5 text-[#20b384] flex-shrink-0" />
                            <span className="text-xs font-bold text-[#0F172A] truncate">{kb.fileName}</span>
                          </div>
                          <div className="ml-8 mt-1 flex items-center gap-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                            <Clock className="w-2 h-2" />
                            {kb.uploadedAt}
                          </div>
                        </div>
                        <button onClick={async () => { await removeKnowledgeBaseFromFirestore(kb.id); const updatedList = await getKnowledgeBases(); setKbList(updatedList); }} className="text-slate-300 hover:text-rose-500 p-1.5 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-[1.5rem] cursor-pointer hover:bg-[#F8FAFC] hover:border-[#20b384] transition-all group overflow-hidden">
                    {isKbUploading ? <Loader2 className="w-8 h-8 text-[#20b384] animate-spin mb-2" /> : <><Upload className="w-8 h-8 text-slate-300 mb-2 group-hover:text-[#20b384] transition-colors" /><span className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-center">Inject PDF Context</span></>}
                    <input type="file" accept=".pdf" className="hidden" onChange={handleKbUpload} disabled={isKbUploading} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-700">
            <div className="fit-gradient rounded-[3rem] p-12 text-white fit-shadow flex flex-col md:flex-row md:items-center justify-between gap-10 relative overflow-hidden">
              <div className="relative z-10 max-w-xl">
                <h1 className="text-5xl font-black mb-4 tracking-tight leading-none">Welcome, {user.name.split(' ')[0]}</h1>
                <p className="text-slate-300 text-xl font-medium leading-relaxed">Intelligence layers are synchronized.</p>
              </div>
              <button onClick={() => setIsLiveActive(true)} className="flex items-center gap-4 px-12 py-6 fit-button-gradient text-white rounded-[2rem] font-black text-xl fit-accent-shadow hover:scale-105 transition-all group relative z-10"><Zap className="w-7 h-7 text-white fill-white group-hover:scale-110 transition-transform" /> Launch Copilot</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="lg:col-span-2 space-y-10">
                {/* Admin Feedback Display for Responder */}
                {adminFeedbackList.length > 0 && (
                  <div className="bg-white p-10 rounded-[3rem] fit-shadow ">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 bg-[#20b384]/10 rounded-2xl"><MessageSquare className="w-8 h-8 text-[#20b384]" /></div>
                      <div>
                        <h3 className="text-2xl font-black text-[#0F172A]">Message from Admin</h3>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Recent performance notes</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {adminFeedbackList.slice(0, 3).map((fb) => (
                        <div key={fb.id} className="p-6 bg-white border border-[#20b384] rounded-[2rem] shadow-sm">
                          <p className="text-sm font-semibold text-slate-700 leading-relaxed mb-4 italic">"{fb.feedbackText}"</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-black uppercase tracking-widest">
                            <Clock className="w-3 h-3" />
                            {fb.createdAt?.toDate().toLocaleString() || 'Recently'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-white p-10 rounded-[3rem] fit-shadow border border-slate-50">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-[#20b384]/10 rounded-2xl"><Sparkles className="w-8 h-8 text-[#20b384]" /></div>
                    <div><h3 className="text-2xl font-black text-[#0F172A]">Post-Call Audit</h3><p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Analyze recordings</p></div>
                  </div>
                  <FileUpload onAnalysisComplete={handleAnalysisComplete} agentName={user.name} />
                </div>


              </div>
              <div className="lg:col-span-1">
                <div className="bg-white rounded-[3rem] fit-shadow border border-slate-50 flex flex-col h-[600px] overflow-hidden">

                  <div className="p-8 border-b border-slate-100 bg-[#F8FAFC]/50">
                    <div className="p-3 bg-[#20b384]/10 rounded-2xl flex flex-row items-center gap-4">
                    <BotMessageSquare className="w-8 h-8 text-[#20b384]" />
                    <h3 className="font-black text-[#0F172A]">Sales Mentor</h3>
                    </div>

                  </div>
                  <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6">

                    {chatHistory.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-[#20b384] text-white' : 'bg-[#F8FAFC] text-[#0F172A] border'
                          }`} dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }} />
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!chatInput.trim() || isChatLoading) return;
                    const userMessage = chatInput;
                    setChatInput('');
                    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
                    setIsChatLoading(true);
                    setChatHistory(prev => [
                      ...prev,
                      { role: 'assistant', content: 'Thinking...' }
                    ]);
                    try {
                      const response = await fetch("/api/gemini", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          model: 'gemini-2.5-flash',
                          contents: `You are a Sales Mentor for company responders.
                                    Rules:
                                    Be polite, answer general question also, give very concise, to-the-point answers.
                                    No explanations, no storytelling untill asked.
                                    Respond in short sentences or bullet points until asked in detail.
                                    Focus only on practical sales advice.
                                    Do not repeat the question.
                                    Do not add assumptions.
                                    If information is missing, say “Insufficient data.”
                                    Tone:
                                    Clear, Direct, Action-oriented, polite
                                    Task:
                                    Answer the responder’s question with only what is necessary to act immediately.. User: ${userMessage}`,
                          config: undefined,
                        }),
                      });
                      const data = await response.json();
                      const text = data.text || 'Error.';
                      setChatHistory(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                          role: 'assistant',
                          content: text
                        };
                        return updated;
                      });

                    } catch (err) {
                      setChatHistory(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                          role: 'assistant',
                          content: 'Service error.'
                        };
                        return updated;
                      });

                    } finally {
                      setIsChatLoading(false);
                    }
                  }} className="p-6 border-t">
                    <div className="relative">
                      <input type="text" placeholder="Ask a question..." className="w-full pl-6 pr-14 py-4 bg-[#F8FAFC] rounded-[1.5rem] outline-none" value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
                      <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#20b384] text-white rounded-xl flex items-center justify-center">
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {recentUploads.length > 0 && (
                <div className="bg-white p-10 rounded-[3rem] fit-shadow border border-slate-50 lg:col-span-3">
                  <h3 className="text-2xl font-black text-[#0F172A] mb-8">Your Recent Audits</h3>
                  <div className="space-y-5">
                    {recentUploads.map(call => {
                      const sentiment = (call.sentiment?.client || 'Neutral').toLowerCase();
                      return (
                        <div key={call.id} className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-[#F8FAFC] border-2 border-transparent hover:border-[#20b384]/20 rounded-[2rem] transition-all cursor-pointer group gap-4" onClick={() => setSelectedCall(call)}>
                          <div className="flex items-start gap-6 w-full">
                            <div className="flex flex-col items-center gap-2">
                              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 shadow-sm ${call.conversionScore > 70 ? 'bg-green-100 text-green-700' : call.conversionScore < 50 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                {call.conversionScore}%
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <h4 className="font-black text-[#0F172A] text-lg">{call.clientName || 'Client'}</h4>
                                <span className="text-[9px] text-slate-400 font-bold bg-white px-2 py-0.5 rounded flex items-center gap-1.5 border border-slate-100">
                                  <Calendar className="w-3 h-3" />
                                  {call.createdAt.toLocaleDateString()}
                                  <Clock className="w-3 h-3 ml-1" />
                                  {call.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-2">
                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${sentiment === 'positive' ? 'bg-green-100 text-green-700' : sentiment === 'negative' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                  }`}>
                                  {sentiment}
                                </span>
                                <span className="text-[10px] font-black text-[#20b384] bg-[#20b384]/10 px-2 py-1 rounded-lg uppercase tracking-tight border border-[#20b384]/10">
                                  {/* Fix: Changed 'report' to 'call' which is correctly scoped within this map function */}
                                  {call.clientConcern || 'General Query'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button onClick={(e) => handleDeleteCallReport(e, call.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </main>

      {selectedCall && (
        <AnalysisReport analysis={selectedCall} onClose={() => setSelectedCall(null)} />
      )}

      {isLiveActive && (
        <LiveCopilot knowledgeBase={instructions} pdfBase64List={kbList.map(item => item.url)} onClose={() => setIsLiveActive(false)} />
      )}
    </div>
  );
};
