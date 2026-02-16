
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  deleteDoc, 
  serverTimestamp, 
  updateDoc, 
  QueryDocumentSnapshot, 
  SnapshotOptions 
} from "firebase/firestore";
import { CompanyKnowledge, User, KnowledgeBase } from "../types";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCWg8E7iMk_yJJ2XYRs3AiKOQVMUsVA8bA",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "callsense-f8512.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "callsense-f8512",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "ccallsense-f8512.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "683613435444",
  appId: process.env.FIREBASE_APP_ID || "1:683613435444:web:6824d4182ef73a04a7fc61",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-X7RJR0B51K"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  deleteDoc,
  serverTimestamp,
};

export const saveCompanyKnowledge = async (knowledge: CompanyKnowledge, fileName?: string) => {
  const kbRef = doc(db, 'settings', 'companyKnowledge');
  await setDoc(kbRef, {
    ...knowledge,
    fileName: fileName || knowledge.fileName || "Unknown",
    uploadedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
};

export const saveAdminRules = async (rules: string) => {
  const kbRef = doc(db, 'settings', 'companyKnowledge');
  await setDoc(kbRef, {
    rules: rules,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

export const getAdminRules = async (): Promise<string> => {
  const kbRef = doc(db, 'settings', 'companyKnowledge');
  const snap = await getDoc(kbRef);
  if (snap.exists()) {
    const data = snap.data();
    return typeof data.rules === 'string' ? data.rules : (Array.isArray(data.rules) ? data.rules.join('\n') : '');
  }
  return '';
};

export const getKnowledgeBases = async (): Promise<KnowledgeBase[]> => {
  const q = query(collection(db, 'knowledgeBaseFiles'), orderBy('uploadedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      fileName: data.fileName,
      url: data.url,
      uploadedAt: data.uploadedAt?.toDate()?.toLocaleString() || new Date().toLocaleString()
    } as KnowledgeBase;
  });
};

export const addKnowledgeBaseToFirestore = async (kb: KnowledgeBase) => {
  await setDoc(doc(db, 'knowledgeBaseFiles', kb.id), {
    fileName: kb.fileName,
    url: kb.url,
    uploadedAt: serverTimestamp()
  });
};

export const removeKnowledgeBaseFromFirestore = async (id: string) => {
  await deleteDoc(doc(db, 'knowledgeBaseFiles', id));
};

export const saveResponderFeedback = async (responderId: string, feedbackText: string) => {
  const feedbackRef = doc(collection(db, 'responderFeedback'));
  await setDoc(feedbackRef, {
    responderId,
    feedbackText,
    createdAt: serverTimestamp()
  });
};

export const getCompanyKnowledge = async (): Promise<CompanyKnowledge | null> => {
  const kbRef = doc(db, 'settings', 'companyKnowledge');
  const snap = await getDoc(kbRef);
  if (snap.exists()) {
    return snap.data() as CompanyKnowledge;
  }
  return null;
};

export const getUnverifiedUsers = async (): Promise<User[]> => {
  const q = query(collection(db, 'users'), where('status', '==', 'UNVERIFIED'), where('role', '==', 'RESPONDER'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
};

export const verifyUser = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { status: 'VERIFIED' });
};

export const rejectUser = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  await deleteDoc(userRef);
};

export const updateCallReportDeletedStatus = async (userId: string, reportId: string, status: boolean) => {
  const reportRef = doc(db, 'callReports', reportId); 
  await updateDoc(reportRef, {
    deletedByResponder: status,
    updatedAt: serverTimestamp()
  });
};

export const callAnalysisConverter = {
  toFirestore: (analysis: any) => {
    return {
      ...analysis,
      agentId: analysis.agentId,
      agentName: analysis.agentName,
      createdAt: analysis.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedByResponder: analysis.deletedByResponder || false,
    };
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options);
    const complianceData = data.compliance || {};
    const feedbackData = data.feedback || {};

    let createdAtDate: Date;
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      createdAtDate = data.createdAt.toDate();
    } else if (data.uploadDate) {
      createdAtDate = new Date(data.uploadDate); 
    } else {
      createdAtDate = new Date(0);
    }

    return {
      id: snapshot.id,
      uploadDate: data.uploadDate,
      agentId: data.agentId || '',
      agentName: data.agentName || 'Unknown Agent',
      clientName: data.clientName,
      clientPhone: data.clientPhone || '',
      clientConcern: data.clientConcern || '',
      duration: data.duration,
      conversionScore: data.conversionScore,
      summary: data.summary,
      sentiment: data.sentiment,
      metrics: data.metrics,
      compliance: {
        dmVerified: complianceData.dmVerified || false,
        needDiscovery: complianceData.needDiscovery || false,
        priceAdherence: complianceData.priceAdherence || false,
        objectionHandled: complianceData.objectionHandled || false,
        hardCloseAttempted: complianceData.hardCloseAttempted || false,
      },
      transcript: data.transcript || [],
      feedback: {
        strengths: feedbackData.strengths || [],
        weaknesses: feedbackData.weaknesses || [],
        actionableSteps: feedbackData.actionableSteps || [],
        missedOpportunities: feedbackData.missedOpportunities || [],
      },
      deletedByResponder: data.deletedByResponder || false,
      createdAt: createdAtDate,
    };
  }
};
