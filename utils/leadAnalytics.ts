
import { CallAnalysis } from '../types';

/**
 * Calculates a weighted lead strength score based on call analysis metrics.
 * This helps sales experts prioritize follow-ups.
 */
export const calculateLeadStrength = (analysis: CallAnalysis): {
  score: number;
  label: 'Hot' | 'Warm' | 'Cold';
  color: string;
} => {
  const metrics = analysis.metrics;
  const compliance = analysis.compliance;

  // Weightings for different factors
  const weights = {
    productKnowledge: 0.3,
    persuasion: 0.3,
    activeListening: 0.2,
    discovery: 0.1,
    objectionHandled: 0.1
  };

  const score = Math.round(
    ((metrics?.productKnowledgeScore || 0) * weights.productKnowledge) +
    ((metrics?.persuasionScore || 0) * weights.persuasion) +
    ((metrics?.activeListeningScore || 0) * weights.activeListening) +
    ((metrics?.clarityScore || 0) * weights.discovery) +
    ((compliance.objectionHandled ? 100 : 0) * weights.objectionHandled)
  );

  if (score >= 75) return { score, label: 'Hot', color: '#20b384' };
  if (score >= 45) return { score, label: 'Warm', color: '#F59E0B' };
  return { score, label: 'Cold', color: '#E11D48' };
};
