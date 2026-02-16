
export enum UserRole {
  ADMIN = 'ADMIN',
  RESPONDER = 'RESPONDER'
}

export enum LeadType {
  NEW_LEAD = 'NEW_LEAD',
  OLD_LEAD = 'OLD_LEAD'
}

export enum RelationshipType {
  LEAD = 'LEAD',
  CLIENT = 'CLIENT'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar: string;
  status: 'VERIFIED' | 'UNVERIFIED';
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
}

export interface CompanyKnowledge {
  id: string;
  rules: string[];
  sops: string[];
  scripts: string[];
  guidelines: string[];
  pricing: Record<string, any>;
  objectionHandling: Array<{ objection: string; response: string }>;
  updatedAt: any;
  fileName?: string;
  uploadedAt?: any;
}

export interface CallAnalysis {
  id: string;
  uploadDate: string;
  agentId: string;
  agentName: string;
  clientName?: string;
  clientPhone?: string;
  clientConcern?: string;
  duration: string;
  conversionScore: number;
  summary: string;
  sentiment: {
    client: 'Positive' | 'Neutral' | 'Negative' | 'Mixed';
    responder: 'Professional' | 'Casual' | 'Aggressive' | 'Passive';
  };
  metrics: {
    politenessScore: number;
    activeListeningScore: number;
    productKnowledgeScore: number;
    empathyScore?: number;
    clarityScore?: number;
    persuasionScore?: number;
  };
  compliance: {
    dmVerified: boolean;
    needDiscovery: boolean;
    priceAdherence: boolean;
    objectionHandled: boolean;
    hardCloseAttempted: boolean;
  };
  transcript: TranscriptSegment[];
  feedback: {
    strengths: string[];
    weaknesses: string[];
    actionableSteps: FeedbackItem[];
    missedOpportunities?: string[];
  };
  deletedByResponder?: boolean;
  createdAt: Date;
}

export interface ResponderFeedback {
  id: string;
  responderId: string;
  feedbackText: string;
  createdAt: any;
}

export interface TranscriptSegment {
  speaker: 'Responder' | 'Client';
  text: string;
  timestamp: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  review?: string;
}

export interface FeedbackItem {
  timestamp?: string;
  suggestion: string;
  category: 'Tone' | 'Knowledge' | 'Sales Tactic' | 'Compliance' | 'Sales Skill';
  priority: 'High' | 'Medium' | 'Low';
  issue?: string;
}

export interface KnowledgeBase {
  id: string;
  fileName: string;
  url: string; // base64
  mimeType?: string;
  uploadedAt: string;
}