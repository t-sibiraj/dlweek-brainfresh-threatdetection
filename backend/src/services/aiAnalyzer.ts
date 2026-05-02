import OpenAI from "openai";
import fs from "fs";
import { env } from "../config/env.js";
import type { PhysicalAnalysisResult, OnlineAnalysisResult } from "../types/index.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

/** Refresh client after API key change */
export function refreshClient(apiKey: string) {
  client = new OpenAI({ apiKey });
}

const PHYSICAL_SCHEMA = {
  type: "object" as const,
  properties: {
    violence: { type: "boolean" as const },
    weapon: { type: "boolean" as const },
    medical_emergency: { type: "boolean" as const },
    nudity: { type: "boolean" as const },
    public_disturbance: { type: "boolean" as const },
    threat_score: { type: "number" as const },
    confidence: { type: "number" as const },
    summary: { type: "string" as const },
  },
  required: [
    "violence",
    "weapon",
    "medical_emergency",
    "nudity",
    "public_disturbance",
    "threat_score",
    "confidence",
    "summary",
  ],
  additionalProperties: false,
};

const ONLINE_SCHEMA = {
  type: "object" as const,
  properties: {
    grooming: { type: "boolean" as const },
    sexual_content: { type: "boolean" as const },
    abusive: { type: "boolean" as const },
    coercion: { type: "boolean" as const },
    manipulation: { type: "boolean" as const },
    threat_score: { type: "number" as const },
    confidence: { type: "number" as const },
    summary: { type: "string" as const },
  },
  required: [
    "grooming",
    "sexual_content",
    "abusive",
    "coercion",
    "manipulation",
    "threat_score",
    "confidence",
    "summary",
  ],
  additionalProperties: false,
};

function buildContextPrompt(contextSummaries: string[]): string {
  if (contextSummaries.length === 0) return "";
  const numbered = contextSummaries
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");
  return `\nPrevious context from this source (oldest to newest):\n${numbered}\n\nUse this context to detect escalation patterns.\n`;
}

/**
 * Analyze a GIF chunk for physical threats
 */
export async function analyzePhysical(
  gifPath: string,
  contextSummaries: string[],
  modelName?: string
): Promise<PhysicalAnalysisResult> {
  const openai = getClient();
  const gifBuffer = fs.readFileSync(gifPath);
  const base64 = gifBuffer.toString("base64");
  const dataUrl = `data:image/gif;base64,${base64}`;
  const model = modelName || env.MODEL_NAME;

  const contextSection = buildContextPrompt(contextSummaries);

  const systemPrompt = `You are a public safety monitoring AI. Analyze the provided GIF from a surveillance camera.
Detect the following threat categories:
- violence: physical fighting, assault, aggressive behavior
- weapon: visible weapons (guns, knives, blunt objects used as weapons)
- medical_emergency: person collapsed, injury, medical distress
- nudity: exposed nudity or indecent exposure
- public_disturbance: loud gathering, vandalism, property damage, rioting

For each category, return true if detected, false otherwise.
Set threat_score as a number 0-100 representing overall danger level.
Set confidence as a number 0-100 representing your confidence in the analysis.
Provide a concise summary describing what you observe.
${contextSection}
Respond ONLY with valid JSON matching the required schema. No extra text.`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await openai.responses.create({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: systemPrompt },
              {
                type: "input_image",
                image_url: dataUrl,
                detail: "auto" as const,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "physical_threat_analysis",
            schema: PHYSICAL_SCHEMA,
            strict: true,
          },
        },
      });

      const text = response.output_text;
      const parsed: PhysicalAnalysisResult = JSON.parse(text);
      return parsed;
    } catch (err) {
      lastError = err as Error;
      console.error(`⚠️ AI analysis attempt ${attempt + 1} failed:`, (err as Error).message);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw new Error(`AI analysis failed after 3 attempts: ${lastError?.message}`);
}

/**
 * Analyze an image for online threats
 */
export async function analyzeOnline(
  imagePath: string,
  contextSummaries: string[],
  modelName?: string
): Promise<OnlineAnalysisResult> {
  const openai = getClient();
  const imageBuffer = fs.readFileSync(imagePath);
  const ext = imagePath.split(".").pop()?.toLowerCase() || "png";
  const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const model = modelName || env.MODEL_NAME;

  const contextSection = buildContextPrompt(contextSummaries);

  const systemPrompt = `You are an online safety monitoring AI. Analyze the provided image for online safety threats.
Detect the following categories:
- grooming: signs of predatory grooming behavior, inappropriate contact with minors
- sexual_content: sexually explicit or suggestive content
- abusive: verbal abuse, harassment, bullying, hate speech
- coercion: threats, blackmail, forced compliance
- manipulation: psychological manipulation, gaslighting, deception

For each category, return true if detected, false otherwise.
Set threat_score as a number 0-100 representing overall danger level.
Set confidence as a number 0-100 representing your confidence in the analysis.
Provide a concise summary describing what you observe.
${contextSection}
Respond ONLY with valid JSON matching the required schema. No extra text.`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await openai.responses.create({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: systemPrompt },
              {
                type: "input_image",
                image_url: dataUrl,
                detail: "auto" as const,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "online_threat_analysis",
            schema: ONLINE_SCHEMA,
            strict: true,
          },
        },
      });

      const text = response.output_text;
      const parsed: OnlineAnalysisResult = JSON.parse(text);
      return parsed;
    } catch (err) {
      lastError = err as Error;
      console.error(`⚠️ AI analysis attempt ${attempt + 1} failed:`, (err as Error).message);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw new Error(`AI analysis failed after 3 attempts: ${lastError?.message}`);
}
