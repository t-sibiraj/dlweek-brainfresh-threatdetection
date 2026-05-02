import { db } from "../db/index.js";
import { threatWeights, systemConfig, sources } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import type {
  Mode,
  Severity,
  PhysicalAnalysisResult,
  OnlineAnalysisResult,
  AnalysisResult,
} from "../types/index.js";

/**
 * Fetch active weights for a mode from the database
 */
export async function getWeightsForMode(mode: Mode): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(threatWeights)
    .where(and(eq(threatWeights.mode, mode), eq(threatWeights.active, true)));

  const weights: Record<string, number> = {};
  for (const row of rows) {
    weights[row.category] = row.weight;
  }
  return weights;
}

/**
 * Calculate threat score from AI result using dynamic weights
 * Score = sum of triggered category weights, capped at 100
 */
export async function calculateScore(
  aiResult: AnalysisResult,
  mode: Mode
): Promise<number> {
  const weights = await getWeightsForMode(mode);
  let score = 0;

  if (mode === "physical") {
    const result = aiResult as PhysicalAnalysisResult;
    if (result.violence && weights["violence"]) score += weights["violence"];
    if (result.weapon && weights["weapon"]) score += weights["weapon"];
    if (result.medical_emergency && weights["medical_emergency"])
      score += weights["medical_emergency"];
    if (result.nudity && weights["nudity"]) score += weights["nudity"];
    if (result.public_disturbance && weights["public_disturbance"])
      score += weights["public_disturbance"];
  } else {
    const result = aiResult as OnlineAnalysisResult;
    if (result.grooming && weights["grooming"]) score += weights["grooming"];
    if (result.sexual_content && weights["sexual_content"])
      score += weights["sexual_content"];
    if (result.abusive && weights["abusive"]) score += weights["abusive"];
    if (result.coercion && weights["coercion"]) score += weights["coercion"];
    if (result.manipulation && weights["manipulation"])
      score += weights["manipulation"];
  }

  return Math.min(score, 100);
}

/**
 * Get triggered category names from AI result
 */
export function getTriggeredCategories(
  aiResult: AnalysisResult,
  mode: Mode
): string[] {
  const categories: string[] = [];

  if (mode === "physical") {
    const r = aiResult as PhysicalAnalysisResult;
    if (r.violence) categories.push("violence");
    if (r.weapon) categories.push("weapon");
    if (r.medical_emergency) categories.push("medical_emergency");
    if (r.nudity) categories.push("nudity");
    if (r.public_disturbance) categories.push("public_disturbance");
  } else {
    const r = aiResult as OnlineAnalysisResult;
    if (r.grooming) categories.push("grooming");
    if (r.sexual_content) categories.push("sexual_content");
    if (r.abusive) categories.push("abusive");
    if (r.coercion) categories.push("coercion");
    if (r.manipulation) categories.push("manipulation");
  }

  return categories;
}

/**
 * Determine severity from score, using per-source overrides or global thresholds
 */
export async function determineSeverity(
  score: number,
  sourceId?: string
): Promise<Severity> {
  let highMin = 70;
  let mediumMax = 40;
  let lowMax = 20;

  // Try per-source thresholds
  if (sourceId) {
    const [source] = await db
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
      .limit(1);

    if (source) {
      if (source.alertThreshold !== null) highMin = source.alertThreshold;
      if (source.mediumThreshold !== null) mediumMax = source.mediumThreshold;
      if (source.lowThreshold !== null) lowMax = source.lowThreshold;
    }
  }

  // Fall through to global config if no source overrides
  if (!sourceId) {
    const [highConfig] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "THREAT_HIGH_MIN"))
      .limit(1);
    const [medConfig] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "THREAT_MEDIUM_MAX"))
      .limit(1);
    const [lowConfig] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "THREAT_LOW_MAX"))
      .limit(1);

    if (highConfig) highMin = JSON.parse(highConfig.value);
    if (medConfig) mediumMax = JSON.parse(medConfig.value);
    if (lowConfig) lowMax = JSON.parse(lowConfig.value);
  }

  if (score >= highMin) return "high";
  if (score > mediumMax) return "medium";
  if (score > lowMax) return "low";
  return "safe";
}
