
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { CallAnalysis, CompanyKnowledge, LeadType, RelationshipType } from "../types";

const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const isInternalError = err.message?.includes('500') || err.status === 500 || (err.error && err.error.code === 500);
    if (retries > 0 && isInternalError) {
      const delay = (4 - retries) * 2000;
      console.warn(`API 500 error, retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(r => setTimeout(r, delay));
      return withRetry(fn, retries - 1);
    }
    throw err;
  }
}

/**
 * Converts a PDF file into a structured JSON knowledge base.
 */
export const convertPdfToKnowledgeJson = async (pdfBase64: string): Promise<CompanyKnowledge> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
        {
          text: `Extract all company knowledge from this PDF (company overview, programs, therapies, products, plans, pricing, rules, SOPs, guidelines, FAQs, objections, compliance).
                Convert everything into well-structured, hierarchical JSON.
                Rules:
                Capture every detail present.
                Preserve section structure.
                Infer clear JSON keys (no fixed schema).
                Use nested objects/arrays.
                Do not summarize or invent content.
                Output:
                Valid JSON only
                Task:
                Create a complete JSON knowledge base for automated sales call comparison.
        ` }
      ]
    },
    config: { responseMimeType: "application/json" }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    ...data,
    rules: data.rules || [],
    sops: data.sops || [],
    scripts: data.scripts || [],
    guidelines: data.guidelines || [],
    pricing: data.pricing || {},
    objectionHandling: data.objectionHandling || [],
    id: crypto.randomUUID(),
    updatedAt: new Date()
  };
};

function calculateDeterministicScore(
  compliance: any,
  buyingSignals: number,
  leadType: LeadType,
  relationshipType: RelationshipType,
  dealOutcome: string
): number {

  const checklistKeys = [
    "dmVerified",
    "needDiscovery",
    "priceAdherence",
    "objectionHandled",
    "hardCloseAttempted"
  ];

  let applicableChecks = [...checklistKeys];

  // Remove intro-related penalties for OLD_LEAD or CLIENT 
  if (leadType === "OLD_LEAD" || relationshipType === "CLIENT") {
    const keysToRemove = ["needDiscovery", "dmVerified"];
    applicableChecks = applicableChecks.filter(
      key => !keysToRemove.includes(key)
    );
  }

  const passed = applicableChecks.filter(key => compliance?.[key] === true).length;
  const percentage = (passed / applicableChecks.length) * 70;

  const buyingBoost = Math.min(buyingSignals || 0, 5) * 6;

  let finalScore = Math.min(100, Math.round(percentage + buyingBoost));

  if (dealOutcome === "HardRejection") {
    finalScore *= 0.15;   // Reduce to 15%
  }

  if (dealOutcome === "SoftRejection") {
    finalScore *= 0.6;    // Reduce to 60%
  }
  return Math.round(finalScore);
}

export const analyzeAudioCall = async (
  audioFile: File,
  agentName: string,
  clientMetadata: {
    name: string;
    phone: string;
    concern: string;
    leadType: LeadType;
    relationshipType: RelationshipType;
  },
  knowledgeJson?: CompanyKnowledge,
  additionalInstructions?: string,
  onStatusUpdate?: (status: string) => void
): Promise<CallAnalysis> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const base64Audio = await fileToBase64(audioFile);

    if (onStatusUpdate) onStatusUpdate("Detecting speech & behavioral cues...");

    let mimeType = audioFile.type;
    const ext = audioFile.name.split('.').pop()?.toLowerCase();
    const typeMap: Record<string, string> = {
      'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'm4a': 'audio/mp4', 'mp4': 'video/mp4', 'mpeg': 'video/mpeg',
      'mpg': 'video/mpeg', 'aac': 'audio/aac', 'flac': 'audio/flac', 'wma': 'audio/x-ms-wma', 'webm': 'audio/webm'
    };

    if (ext && typeMap[ext]) {
      mimeType = typeMap[ext];
    } else if (!mimeType || mimeType === '' || mimeType === 'application/octet-stream') {
      mimeType = 'audio/mpeg';
    }

    let audioAnalysisResponse: GenerateContentResponse;
    try {
      audioAnalysisResponse = await withRetry(() => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: base64Audio } },
            {
              text: `Analyze this sales call between Responder: ${agentName} and a Client (Hindi, English, or Gujarati).
              
              GOAL: 
              1.Extract each conversation of both parties, don't miss any.
              2. Extract a high-fidelity transcript in English, Hinglish or Gujlish.
              3. Identify if the responder addresses the client by name.
              4. If found, capture that name for the 'clientName' field.
              
              Return JSON matching the schema.` }
          ]
        },
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              clientName: { type: Type.STRING, description: "Extracted client name or 'Client'" },
              rawTranscript: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    speaker: { type: Type.STRING, description: '"Responder" or "Client"' },
                    timestamp: { type: Type.STRING },
                    text: { type: Type.STRING },
                    review: { type: Type.STRING }
                  },
                  required: ['speaker', 'timestamp', 'text']
                }
              }
            },
            required: ['rawTranscript']
          }
        }
      }));
    } catch (apiErr: any) {
      throw new Error(`Speech analysis failed. ${apiErr.message}`);
    }

    const audioMetadata = JSON.parse(audioAnalysisResponse.text || "{}");
    if (!audioMetadata.rawTranscript) throw new Error("No conversation detected.");

    if (onStatusUpdate) onStatusUpdate("Auditing against knowledge base...");

    const auditPrompt = `
      ROLE: CRITICAL SALES AUDITOR. 
      Auditing ${agentName} (Responder) performance with client ${audioMetadata.clientName || 'Client'}.
      
      CONTEXT:
      - Lead Type: ${clientMetadata.leadType} (NEW_LEAD: No prior company knowledge. OLD_LEAD: Prior interaction, aware of services.)
      - Relationship Type: ${clientMetadata.relationshipType} (LEAD: Potential client. CLIENT: Existing customer.)
      
      INSTRUCTIONS:
      1. Evaluate strict objective compliance (TRUE/FALSE):
        - dmVerified: Spoke to the decision maker.
        - needDiscovery: Performed discovery of needs/pain points.
        - priceAdherence: Clearly discussed pricing based on knowledge base.
        - objectionHandled: Addressed client pushbacks/objections effectively.
        - hardCloseAttempted: Made a clear attempt to close the deal/appointment.

      2. Extract count of BUYING SIGNALS (price breakdown, payment method, start date, guarantee, enrollment process asked by client).

      3. Determine dealOutcome (HardRejection, SoftRejection, Neutral, StrongInterest).

      TRANSCRIPT:
      ${JSON.stringify(audioMetadata.rawTranscript)}

      COMPANY KNOWLEDGE (JSON):
      ${knowledgeJson ? JSON.stringify(knowledgeJson) : "No specific SOP provided."}

      ${additionalInstructions ? `ADMIN RULES: ${additionalInstructions}` : ""}

      Return a detailed report following the strict response schema.
    `;

    let reasoningResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ text: auditPrompt }] },
      config: { 
        responseMimeType: "application/json", 
        temperature: 0.1,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clientName: { type: Type.STRING },
            buyingSignals: { type: Type.INTEGER, description: "Count of client buying signals observed" },
            dealOutcome: { type: Type.STRING, description: "One of: HardRejection, SoftRejection, Neutral, StrongInterest" },
            summary: { type: Type.STRING, description: "Blunt, expert assessment of call quality" },
            sentiment: {
              type: Type.OBJECT,
              properties: {
                client: { type: Type.STRING, description: "Positive: Receptive, appreciative, or ready to proceed. Neutral: Seeking information, clarifying details, or showing no clear bias. Negative: Declining service, expressing price objections (e.g., 'too expensive' or 'out of budget'), or showing skepticism." },
                responder: { type: Type.STRING, description: "Professional, Passive, or Aggressive" }
              },
              required: ["client", "responder"]
            },
            metrics: {
              type: Type.OBJECT,
              properties: {
                activeListeningScore: { type: Type.INTEGER, description: "Score int(0-100): how well agent identified client pain points and goals" },
                productKnowledgeScore: { type: Type.INTEGER, description: "Score int(0-100): accuracy of plan, therapy, and pricing explanation" },
                empathyScore: { type: Type.INTEGER, description: "Score int(0-100): rapport building and emotional understanding" },
                persuasionScore: { type: Type.INTEGER, description: "Score int(0-100): agent confidence and strength in justifying value" },
                politenessScore: { type: Type.INTEGER, description: "Score int(0-100): courtesy and professional etiquette" },
                clarityScore: { type: Type.INTEGER, description: "Score int(0-100): communication clarity and lack of jargon" }
              },
              required: ["activeListeningScore", "productKnowledgeScore", "empathyScore", "persuasionScore"]
            },
            compliance: {
              type: Type.OBJECT,
              properties: {
                dmVerified: { type: Type.BOOLEAN },
                needDiscovery: { type: Type.BOOLEAN },
                priceAdherence: { type: Type.BOOLEAN },
                objectionHandled: { type: Type.BOOLEAN },
                hardCloseAttempted: { type: Type.BOOLEAN }
              },
              required: ["dmVerified", "needDiscovery", "priceAdherence", "objectionHandled", "hardCloseAttempted"]
            },
            transcript: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: { type: Type.STRING },
                  text: { type: Type.STRING, description: "reproduce the full dialogue text"},
                  timestamp: { type: Type.STRING },
                  sentiment: { type: Type.STRING,  description: "only one word sentiment"},
                  review: { type: Type.STRING }
                },
                required: ["speaker", "text", "timestamp", "sentiment", "review"]
              }
            },
            feedback: {
              type: Type.OBJECT,
              properties: {
                strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                missedOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
                actionableSteps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      timestamp: { type: Type.STRING },
                      issue: { type: Type.STRING },
                      suggestion: { type: Type.STRING },
                      category: { type: Type.STRING },
                      priority: { type: Type.STRING }
                    }
                  }
                }
              },
              required: ["strengths", "weaknesses", "actionableSteps"]
            }
          },
          required: ["buyingSignals", "dealOutcome", "summary", "sentiment", "metrics", "compliance", "feedback"]
        }
      }
    });

    const parsed = JSON.parse(reasoningResponse.text || "{}");

    const buyingSignals = parsed.buyingSignals || 0;
    const dealOutcome = parsed.dealOutcome || "";
    const deterministicScore = calculateDeterministicScore(
      parsed.compliance,
      buyingSignals,
      clientMetadata.leadType,
      clientMetadata.relationshipType,
      dealOutcome
    );

    const auditResult: CallAnalysis = {
      ...parsed,
      conversionScore: deterministicScore,
      transcript: parsed.transcript || audioMetadata.rawTranscript || [],
      feedback: {
        strengths: parsed.feedback?.strengths || [],
        weaknesses: parsed.feedback?.weaknesses || [],
        actionableSteps: parsed.feedback?.actionableSteps || [],
        missedOpportunities: parsed.feedback?.missedOpportunities || [],
      },
      compliance: parsed.compliance || {
        dmVerified: false,
        needDiscovery: false,
        priceAdherence: false,
        objectionHandled: false,
        hardCloseAttempted: false
      },
      metrics: parsed.metrics || {
        politenessScore: 0,
        activeListeningScore: 0,
        productKnowledgeScore: 0,
        empathyScore: 0,
        persuasionScore: 0,
        clarityScore: 0
      },
      sentiment: parsed.sentiment || {
        client: 'Neutral',
        responder: 'Professional'
      },
      id: crypto.randomUUID(),
      uploadDate: new Date().toLocaleDateString(),
      agentName: agentName,
      clientName: clientMetadata.name || parsed.clientName || audioMetadata.clientName || 'Client',
      clientPhone: clientMetadata.phone,
      clientConcern: clientMetadata.concern,
      createdAt: new Date(),
    };

    return auditResult;
  } catch (error: any) {
    throw error;
  }
};
