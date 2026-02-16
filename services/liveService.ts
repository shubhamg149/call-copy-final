import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

export const prepareLiveContext = async (pdfBase64List: string[] = [], instructions?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const parts: any[] = [
    { text: `
      Your task is to create a concise "Sales Battlecard" from the provided documents and instructions.
      
      Target Audience for this Battlecard: An AI Sales Copilot that needs to give real-time, short advice to a human agent during a call.
      
      Structure the output as:
      1. PRODUCT_INFO: Key features and benefits (bullet points).
      2. PRICING: Exact numbers and plans.
      3. OBJECTION_HANDLING: Short counter-arguments for common pushbacks.
      4. COMPLIANCE: Mandatory disclaimers.
      
      Keep it dense and information-rich. No fluff.
    `}
  ];
  
  pdfBase64List.forEach(pdf => {
    parts.push({ inlineData: { mimeType: "application/pdf", data: pdf } });
  });

  if (instructions) {
    parts.push({ text: `Additional Admin Instructions: ${instructions}` });
  }

  // If no context, return a generic prompt to avoid empty context issues
  if (parts.length === 1) {
      return instructions || "General Sales Consultation Principles.";
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts },
      config: { temperature: 0 }
    });
    return response.text || "Context extraction returned empty.";
  } catch (err) {
    console.error("Context Prep Error:", err);
    return "Error preparing context. Use general knowledge.";
  }
};

export interface LiveSessionConfig {
  digestedContext: string;
  onTranscript: (text: string, isModel: boolean, review?: string) => void;
  onSuggestion: (suggestion: string) => void;
  onError: (error: string) => void;
}

export const startLiveCopilot = async (config: LiveSessionConfig) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let currentOutputTranscription = '';

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks: {
      onopen: () => console.log("Live Copilot Connected"),
      onmessage: async (message: LiveServerMessage) => {
        // Handle Model Output Transcription (The "Suggestion")
        if (message.serverContent?.outputTranscription) {
          currentOutputTranscription += message.serverContent.outputTranscription.text;
        }
        
        // Handle User Input Transcription (Confirmation of listening)
        if (message.serverContent?.inputTranscription) {
           if (message.serverContent.inputTranscription.text) {
               config.onTranscript(message.serverContent.inputTranscription.text, false);
           }
        }

        // When the model is done "speaking" (turnComplete), we treat the accumulated text as the full suggestion
        if (message.serverContent?.turnComplete) {
          if (currentOutputTranscription.trim()) {
            config.onSuggestion(currentOutputTranscription.trim());
            currentOutputTranscription = '';
          }
        }
      },
      onerror: (e) => {
        console.error("Session Error:", e);
        config.onError("Connection interrupted. Please restart.");
      },
      onclose: () => console.log("Live Copilot Closed"),
    },
    config: {
      responseModalities: [Modality.AUDIO], // Audio modality allows the model to "speak" its advice, which we transcribe.
      systemInstruction: `
        You are a Real-Time Sales Copilot.
        You are listening to a sales call.
        Your output will NOT be heard by the client. It is whispered to the Agent.
        
        YOUR GOAL: Help the Agent convert the lead.
        
        INSTRUCTIONS:
        1. Listen for questions about pricing, features, or objections.
        2. IMMEDIATELY provide the answer or a counter-tactic based on the BATTLECARD below.
        3. Keep responses SHORT (under 2 sentences).
        4. If the agent is doing well, stay silent. Only intervene to help.
        
        BATTLECARD DATA:
        ${config.digestedContext}
      `,
      // FIX: Removed invalid 'model' property. Passing empty objects enables transcription.
      inputAudioTranscription: {}, 
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
      }
    }
  });

  // Audio Setup
  // We use a high-quality capture but depend on the context for sample rate to avoid mismatches
  const stream = await navigator.mediaDevices.getUserMedia({ 
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    } 
  });

  // Initialize AudioContext
  // Note: We do NOT force 16000 here in the constructor if we want to avoid potential browser errors.
  // Instead we accept the system rate and inform Gemini via the mimeType.
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass();
  
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    
    // Convert to Int16 PCM
    const pcmData = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    // Convert to Base64
    let binary = '';
    const bytes = new Uint8Array(pcmData.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    // Send to Gemini
    // We must pass the correct sample rate of the data we are sending
    const currentRate = audioContext.sampleRate;
    
    sessionPromise.then(session => {
      session.sendRealtimeInput({ 
        media: {
          mimeType: `audio/pcm;rate=${currentRate}`,
          data: base64Data
        }
      });
    });
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    stop: async () => {
      source.disconnect();
      processor.disconnect();
      stream.getTracks().forEach(track => track.stop());
      
      // Close session
      const session = await sessionPromise;
      session.close();
      
      await audioContext.close();
    }
  };
};
