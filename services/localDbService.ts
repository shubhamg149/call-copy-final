
import { KnowledgeBase } from '../types';

/**
 * localDbService now only handles non-migrated client-side storage if needed.
 * Intelligence context and Knowledge Base lists have been moved to Firestore.
 */

export const saveAdminInstructions = (instructions: string) => {
  // Deprecated: use firebaseService.saveAdminRules instead
};

export const getAdminInstructions = (): string => {
  // Deprecated: use firebaseService.getAdminRules instead
  return '';
};

export const saveKnowledgeBaseList = (kbList: KnowledgeBase[]) => {
  // Deprecated: use firebaseService.addKnowledgeBaseToFirestore instead
};

export const getKnowledgeBaseList = (): KnowledgeBase[] => {
  // Deprecated: use firebaseService.getKnowledgeBases instead
  return [];
};

export const addKnowledgeBaseFile = (kb: KnowledgeBase) => {
  // Deprecated: use firebaseService.addKnowledgeBaseToFirestore instead
};

export const removeKnowledgeBaseFile = (id: string) => {
  // Deprecated: use firebaseService.removeKnowledgeBaseFromFirestore instead
};
