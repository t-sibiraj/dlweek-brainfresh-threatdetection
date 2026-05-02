import { EventEmitter } from "events";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { jobs, threatEvents } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { convertToGif } from "./videoProcessor.js";
import { analyzeWithProvider } from "./aiProviders.js";
import {
  calculateScore,
  getTriggeredCategories,
  determineSeverity,
} from "./threatScorer.js";
import { addSummary, getContext } from "./contextMemory.js";
import { checkEscalation } from "./escalation.js";
import { dispatchAlert } from "./alertService.js";
import type { Job, Mode, JobStatus } from "../types/index.js";

interface QueueItem {
  job: Job;
  resolve: (value: void) => void;
  reject: (reason: Error) => void;
}

export class JobQueue extends EventEmitter {
  private queue: QueueItem[] = [];
  private activeCount = 0;
  private maxConcurrent: number;

  constructor() {
    super();
    this.maxConcurrent = env.MAX_CONCURRENT_JOBS;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get activeJobs(): number {
    return this.activeCount;
  }

  /**
   * Enqueue a job for processing. Returns a promise that resolves when complete.
   */
  enqueue(job: Job): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ job, resolve, reject });

      this.emit("job:queued", {
        source_id: job.sourceId,
        job_id: job.id,
        status: "queued" as JobStatus,
        timestamp: new Date().toISOString(),
      });

      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift()!;
    this.activeCount++;

    const { job, resolve, reject } = item;

    try {
      // Update status to processing
      await db
        .update(jobs)
        .set({ status: "processing" })
        .where(eq(jobs.id, job.id));

      this.emit("job:processing", {
        source_id: job.sourceId,
        job_id: job.id,
        status: "processing" as JobStatus,
        timestamp: new Date().toISOString(),
      });

      const startTime = Date.now();

      // Get context for this source
      const context = await getContext(job.sourceId);

      let aiResult: any;
      let score: number;
      let categories: string[];

      if (job.mode === "physical") {
        // For physical mode, the mediaPath might already be a GIF or need conversion
        let gifPath = job.mediaPath;
        if (!job.mediaPath.endsWith(".gif")) {
          gifPath = await convertToGif(
            job.mediaPath,
            `${job.id}.gif`
          );
        }
        aiResult = await analyzeWithProvider(gifPath, "physical", context);
        score = await calculateScore(aiResult, "physical");
        categories = getTriggeredCategories(aiResult, "physical");
      } else {
        aiResult = await analyzeWithProvider(job.mediaPath, "online", context);
        score = await calculateScore(aiResult, "online");
        categories = getTriggeredCategories(aiResult, "online");
      }

      const severity = await determineSeverity(score, job.sourceId);
      const latencyMs = Date.now() - startTime;

      // Store threat event
      const eventId = uuid();
      await db.insert(threatEvents).values({
        id: eventId,
        sourceId: job.sourceId,
        jobId: job.id,
        categories: categories,
        threatScore: score,
        confidence: aiResult.confidence,
        summary: aiResult.summary,
        createdAt: new Date(),
      });

      // Update job as completed
      await db
        .update(jobs)
        .set({
          status: "completed",
          threatScore: score,
          completedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));

      // Add to context memory
      await addSummary(job.sourceId, aiResult.summary, job.mode);

      // Emit completion event
      this.emit("job:completed", {
        source_id: job.sourceId,
        job_id: job.id,
        status: "completed" as JobStatus,
        threat_score: score,
        categories,
        confidence: aiResult.confidence,
        summary: aiResult.summary,
        severity,
        latency_ms: latencyMs,
        timestamp: new Date().toISOString(),
      });

      // Check escalation
      const escalation = await checkEscalation(job.sourceId);
      if (escalation.escalated) {
        this.emit("threat:alert", {
          source_id: job.sourceId,
          severity: "high",
          threat_score: score,
          reason: escalation.reason,
          timestamp: new Date().toISOString(),
        });

        // Dispatch to webhooks + push notifications
        dispatchAlert("escalation", {
          source_id: job.sourceId,
          threat_score: score,
          severity: "high",
          reason: escalation.reason,
          categories,
          summary: aiResult.summary,
        }).catch((err) =>
          console.error("Alert dispatch error:", err.message)
        );
      }

      // Dispatch high/medium threat alerts
      if (severity === "high") {
        dispatchAlert("threat_high", {
          source_id: job.sourceId,
          threat_score: score,
          severity,
          categories,
          summary: aiResult.summary,
        }).catch((err) =>
          console.error("Alert dispatch error:", err.message)
        );
      } else if (severity === "medium") {
        dispatchAlert("threat_medium", {
          source_id: job.sourceId,
          threat_score: score,
          severity,
          categories,
          summary: aiResult.summary,
        }).catch((err) =>
          console.error("Alert dispatch error:", err.message)
        );
      }

      resolve();
    } catch (err) {
      const error = err as Error;
      console.error(`❌ Job ${job.id} failed:`, error.message);

      // Update job as error
      await db
        .update(jobs)
        .set({ status: "error", completedAt: new Date() })
        .where(eq(jobs.id, job.id));

      this.emit("job:error", {
        source_id: job.sourceId,
        job_id: job.id,
        status: "error" as JobStatus,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      reject(error);
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  /**
   * Get queue status for a source
   */
  getSourceQueueLength(sourceId: string): number {
    return this.queue.filter((item) => item.job.sourceId === sourceId).length;
  }
}

// Singleton instance
export const jobQueue = new JobQueue();
