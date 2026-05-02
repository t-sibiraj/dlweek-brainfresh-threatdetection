/**
 * Multi-provider AI abstraction layer.
 * Supports OpenAI, Anthropic (Claude), and Google (Gemini).
 * Falls back to OpenAI if provider not configured.
 */

import { env } from "../config/env.js";
import { analyzePhysical as openaiPhysical, analyzeOnline as openaiOnline } from "./aiAnalyzer.js";
import type {
  PhysicalAnalysisResult,
  OnlineAnalysisResult,
  AIProvider,
} from "../types/index.js";
import fs from "fs";

// ─── Anthropic Provider ───────────────────────────────────
async function anthropicAnalyze(
  imagePath: string,
  mode: "physical" | "online",
  contextSummaries: string[],
  modelName?: string
): Promise<PhysicalAnalysisResult | OnlineAnalysisResult> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const ext = imagePath.split(".").pop()?.toLowerCase() || "png";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  const mediaType = mimeMap[ext] || "image/png";
  const base64 = imageBuffer.toString("base64");
  const model = modelName || "claude-sonnet-4-20250514";

  const contextSection =
    contextSummaries.length > 0
      ? `\nPrevious context:\n${contextSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`
      : "";

  const categories =
    mode === "physical"
      ? "violence, weapon, medical_emergency, nudity, public_disturbance"
      : "grooming, sexual_content, abusive, coercion, manipulation";

  const prompt = `Analyze this image for ${mode} safety threats. Detect: ${categories}.
Return JSON with each category as boolean, plus threat_score (0-100), confidence (0-100), and summary string.
${contextSection}
Respond ONLY with valid JSON. No markdown, no explanation.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
  }

  const json: any = await response.json();
  const text = json.content?.[0]?.text || "";
  // Extract JSON from possible markdown wrapping
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in Anthropic response");
  return JSON.parse(jsonMatch[0]);
}

// ─── Google Gemini Provider ───────────────────────────────
async function googleAnalyze(
  imagePath: string,
  mode: "physical" | "online",
  contextSummaries: string[],
  modelName?: string
): Promise<PhysicalAnalysisResult | OnlineAnalysisResult> {
  if (!env.GOOGLE_AI_KEY) {
    throw new Error("GOOGLE_AI_KEY not configured");
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const ext = imagePath.split(".").pop()?.toLowerCase() || "png";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  const mimeType = mimeMap[ext] || "image/png";
  const base64 = imageBuffer.toString("base64");
  const model = modelName || "gemini-2.0-flash";

  const contextSection =
    contextSummaries.length > 0
      ? `\nPrevious context:\n${contextSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`
      : "";

  const categories =
    mode === "physical"
      ? "violence, weapon, medical_emergency, nudity, public_disturbance"
      : "grooming, sexual_content, abusive, coercion, manipulation";

  const prompt = `Analyze this image for ${mode} safety threats. Detect: ${categories}.
Return JSON with each category as boolean, plus threat_score (0-100), confidence (0-100), and summary string.
${contextSection}
Respond ONLY with valid JSON. No markdown, no explanation.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GOOGLE_AI_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errBody}`);
  }

  const json: any = await response.json();
  const text =
    json.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in Gemini response");
  return JSON.parse(jsonMatch[0]);
}

// ─── Provider Router ──────────────────────────────────────

function getProvider(): AIProvider {
  const provider = env.AI_PROVIDER as AIProvider;
  // Validate provider has keys configured
  if (provider === "anthropic" && !env.ANTHROPIC_API_KEY) return "openai";
  if (provider === "google" && !env.GOOGLE_AI_KEY) return "openai";
  return provider;
}

export async function analyzeWithProvider(
  imagePath: string,
  mode: "physical" | "online",
  contextSummaries: string[],
  modelName?: string,
  providerOverride?: AIProvider
): Promise<PhysicalAnalysisResult | OnlineAnalysisResult> {
  const provider = providerOverride || getProvider();

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      switch (provider) {
        case "anthropic":
          return await anthropicAnalyze(
            imagePath,
            mode,
            contextSummaries,
            modelName
          );
        case "google":
          return await googleAnalyze(
            imagePath,
            mode,
            contextSummaries,
            modelName
          );
        case "openai":
        default:
          if (mode === "physical") {
            return await openaiPhysical(
              imagePath,
              contextSummaries,
              modelName
            );
          } else {
            return await openaiOnline(
              imagePath,
              contextSummaries,
              modelName
            );
          }
      }
    } catch (err) {
      lastError = err as Error;
      console.error(
        `⚠️ ${provider} analysis attempt ${attempt + 1} failed:`,
        (err as Error).message
      );
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  // Fallback to OpenAI if non-OpenAI provider failed
  if (provider !== "openai") {
    console.log(`⚠️ Falling back to OpenAI after ${provider} failures`);
    try {
      if (mode === "physical") {
        return await openaiPhysical(imagePath, contextSummaries, modelName);
      } else {
        return await openaiOnline(imagePath, contextSummaries, modelName);
      }
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw new Error(
    `AI analysis failed after 3 attempts (${provider}): ${lastError?.message}`
  );
}

export function listProviders(): {
  provider: AIProvider;
  configured: boolean;
  active: boolean;
}[] {
  const current = getProvider();
  return [
    {
      provider: "openai",
      configured: !!env.OPENAI_API_KEY,
      active: current === "openai",
    },
    {
      provider: "anthropic",
      configured: !!env.ANTHROPIC_API_KEY,
      active: current === "anthropic",
    },
    {
      provider: "google",
      configured: !!env.GOOGLE_AI_KEY,
      active: current === "google",
    },
  ];
}
