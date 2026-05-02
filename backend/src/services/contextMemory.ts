import { db } from "../db/index.js";
import { contextSummaries } from "../db/schema.js";
import { eq, desc, asc } from "drizzle-orm";
import { env } from "../config/env.js";
import { v4 as uuid } from "uuid";

/**
 * Persistent sliding window context memory per source.
 * Stored in PostgreSQL context_summaries table.
 * Physical: max MAX_VIDEO_CONTEXT summaries (default 10)
 * Online: max MAX_IMAGE_CONTEXT summaries (default 20)
 */

export async function addSummary(
  sourceId: string,
  summary: string,
  mode: "physical" | "online",
  customLimit?: number
): Promise<void> {
  // Insert new summary
  await db.insert(contextSummaries).values({
    id: uuid(),
    sourceId,
    summary,
    mode,
    createdAt: new Date(),
  });

  const maxLimit =
    customLimit ??
    (mode === "physical" ? env.MAX_VIDEO_CONTEXT : env.MAX_IMAGE_CONTEXT);

  // Count total for this source and prune oldest if over limit
  const allSummaries = await db
    .select({ id: contextSummaries.id })
    .from(contextSummaries)
    .where(eq(contextSummaries.sourceId, sourceId))
    .orderBy(asc(contextSummaries.createdAt));

  if (allSummaries.length > maxLimit) {
    const toDelete = allSummaries.slice(0, allSummaries.length - maxLimit);
    for (const row of toDelete) {
      await db
        .delete(contextSummaries)
        .where(eq(contextSummaries.id, row.id));
    }
  }
}

export async function getContext(sourceId: string): Promise<string[]> {
  const rows = await db
    .select({ summary: contextSummaries.summary })
    .from(contextSummaries)
    .where(eq(contextSummaries.sourceId, sourceId))
    .orderBy(asc(contextSummaries.createdAt));

  return rows.map((r) => r.summary);
}

export async function clearContext(sourceId: string): Promise<void> {
  await db
    .delete(contextSummaries)
    .where(eq(contextSummaries.sourceId, sourceId));
}

export async function getAllContexts(): Promise<Map<string, string[]>> {
  const rows = await db
    .select()
    .from(contextSummaries)
    .orderBy(asc(contextSummaries.createdAt));

  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!map.has(row.sourceId)) {
      map.set(row.sourceId, []);
    }
    map.get(row.sourceId)!.push(row.summary);
  }
  return map;
}
