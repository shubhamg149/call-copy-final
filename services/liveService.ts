export const prepareLiveContext = async (pdfBase64List: string[] = [], instructions?: string): Promise<string> => {
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
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: { temperature: 0 }
      }),
    });

    if (!response.ok) {
      console.error("Context Prep Error:", response.statusText);
      return "Error preparing context. Use general knowledge.";
    }

    const data = await response.json();
    return data.text || "Context extraction returned empty.";
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

  // Buffer PCM data so we can periodically send chunks to the backend
  const pcmBuffer: Int16Array[] = [];
  let lastSendTime = 0;
  const SEND_INTERVAL_MS = 5000; // send approximately every 5 seconds

  const sendChunkToBackend = async (base64Data: string, sampleRate: number) => {
    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: `audio/pcm;rate=${sampleRate}`,
                  data: base64Data,
                },
              },
              {
                text: `
                  You are a Real-Time Sales Copilot.
                  You are listening to a short segment of a sales call.
                  Your output will NOT be heard by the client. It is whispered to the Agent.

                  YOUR GOAL: Help the Agent convert the lead.

                  INSTRUCTIONS:
                  1. Listen for questions about pricing, features, or objections.
                  2. IMMEDIATELY provide the answer or a counter-tactic based on the BATTLECARD below.
                  3. Keep responses SHORT (under 2 sentences).
                  4. If the agent is doing well, stay silent. Only intervene to help.

                  BATTLECARD DATA:
                  ${config.digestedContext}

                  Return JSON only, with the following shape:
                  {
                    "transcript": "Short transcription of this segment in English/Hinglish/Gujlish",
                    "suggestion": "Your brief coaching suggestion for the agent, or an empty string if none needed"
                  }
                `,
              },
            ],
          },
          config: {
            responseMimeType: "application/json",
            temperature: 0.3,
          },
        }),
      });

      if (!response.ok) {
        console.error("Live Copilot backend error:", response.statusText);
        return;
      }

      const result = await response.json();
      const parsed = JSON.parse(result.text || "{}");

      if (parsed.transcript) {
        config.onTranscript(parsed.transcript, false);
      }
      if (parsed.suggestion) {
        config.onSuggestion(parsed.suggestion);
      }
    } catch (e: any) {
      console.error("Live Copilot backend error:", e);
      config.onError("Error contacting live copilot backend.");
    }
  };

  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    
    // Convert to Int16 PCM
    const pcmData = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Buffer this chunk
    pcmBuffer.push(pcmData);

    const now = Date.now();
    if (now - lastSendTime >= SEND_INTERVAL_MS && pcmBuffer.length > 0) {
      lastSendTime = now;

      // Concatenate buffered PCM into a single Int16Array
      const totalLength = pcmBuffer.reduce((sum, arr) => sum + arr.length, 0);
      const merged = new Int16Array(totalLength);
      let offset = 0;
      for (const arr of pcmBuffer) {
        merged.set(arr, offset);
        offset += arr.length;
      }

      // Clear buffer
      pcmBuffer.length = 0;

      // Convert to Base64
      let binary = "";
      const bytes = new Uint8Array(merged.buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      // We must pass the correct sample rate of the data we are sending
      const currentRate = audioContext.sampleRate;
      void sendChunkToBackend(base64Data, currentRate);
    }
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    stop: async () => {
      source.disconnect();
      processor.disconnect();
      stream.getTracks().forEach(track => track.stop());

      await audioContext.close();
    }
  };
};
