import { db } from "../db/index.js";
import { threatEvents, escalationRules } from "../db/schema.js";
import { eq, desc, and, isNull } from "drizzle-orm";
import type { EscalationRule } from "../types/index.js";

/**
 * Check escalation rules for a source after a new threat event
 * Returns true if escalation should be triggered
 */
export async function checkEscalation(sourceId: string): Promise<{
  escalated: boolean;
  reason?: string;
}> {
  // Fetch global rules + source-specific rules
  const globalRules = await db
    .select()
    .from(escalationRules)
    .where(
      and(eq(escalationRules.active, true), isNull(escalationRules.sourceId))
    );

  const sourceRules = await db
    .select()
    .from(escalationRules)
    .where(
      and(
        eq(escalationRules.active, true),
        eq(escalationRules.sourceId, sourceId)
      )
    );

  const allRules = [...globalRules, ...sourceRules];

  // Fetch recent events for this source
  const recentEvents = await db
    .select()
    .from(threatEvents)
    .where(eq(threatEvents.sourceId, sourceId))
    .orderBy(desc(threatEvents.createdAt))
    .limit(20); // Enough for any window

  for (const rule of allRules) {
    const config = {
      type: rule.ruleType,
      ...(rule.config as Record<string, any>),
    } as EscalationRule;

    switch (config.type) {
      case "consecutive": {
        const { count, threshold } = config;
        if (recentEvents.length >= count) {
          const lastN = recentEvents.slice(0, count);
          const allAbove = lastN.every((e) => e.threatScore > threshold);
          if (allAbove) {
            return {
              escalated: true,
              reason: `${count} consecutive events above threshold ${threshold}`,
            };
          }
        }
        break;
      }

      case "average": {
        const { window: windowSize, threshold } = config;
        if (recentEvents.length >= windowSize) {
          const lastN = recentEvents.slice(0, windowSize);
          const avg =
            lastN.reduce((sum, e) => sum + e.threatScore, 0) / windowSize;
          if (avg > threshold) {
            return {
              escalated: true,
              reason: `Average of last ${windowSize} events (${avg.toFixed(1)}) above threshold ${threshold}`,
            };
          }
        }
        break;
      }

      case "category_repeat": {
        const { category, count: repeatCount, window: windowSize } = config;
        const windowEvents = recentEvents.slice(0, windowSize);
        let categoryCount = 0;
        for (const event of windowEvents) {
          const categories = event.categories as string[];
          if (categories.includes(category)) {
            categoryCount++;
          }
        }
        if (categoryCount >= repeatCount) {
          return {
            escalated: true,
            reason: `"${category}" detected ${categoryCount} times in last ${windowSize} events`,
          };
        }
        break;
      }
    }
  }

  return { escalated: false };
}
