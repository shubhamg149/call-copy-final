import type { VercelRequest, VercelResponse } from "vercel/node";
import { GoogleGenAI } from "@google/genai";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { model, contents, config } = req.body;

    if (!model || !contents) {
      return res.status(400).json({ error: "Missing model or contents" });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });

    return res.status(200).json({
      text: response.text,
      raw: response,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Gemini request failed",
      details: error?.message || "Unknown error",
    });
  }
}
