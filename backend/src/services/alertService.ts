import { db } from "../db/index.js";
import {
  webhookEndpoints,
  pushSubscriptions,
  alertLog,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import webPush from "web-push";
import { env } from "../config/env.js";
import type { AlertEventType, WebhookPayload } from "../types/index.js";

// Initialize web-push if VAPID keys are configured
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    env.VAPID_EMAIL,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
}

// ─── Webhook delivery ─────────────────────────────────────

function signPayload(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

async function deliverWebhook(
  endpoint: { id: string; url: string; secret: string },
  payload: WebhookPayload
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, endpoint.secret);
  const logId = uuid();

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VoidDeck-Signature": `sha256=${signature}`,
        "X-VoidDeck-Event": payload.event,
        "X-VoidDeck-Delivery": logId,
      },
      body,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    await db.insert(alertLog).values({
      id: logId,
      type: "webhook",
      targetId: endpoint.id,
      eventType: payload.event,
      payload: payload as any,
      status: response.ok ? "sent" : "failed",
      error: response.ok ? null : `HTTP ${response.status}`,
      createdAt: new Date(),
    });
  } catch (err: any) {
    await db.insert(alertLog).values({
      id: logId,
      type: "webhook",
      targetId: endpoint.id,
      eventType: payload.event,
      payload: payload as any,
      status: "failed",
      error: err.message?.slice(0, 500),
      createdAt: new Date(),
    });
  }
}

// ─── Push notification delivery ───────────────────────────

async function deliverPush(
  subscription: {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: WebhookPayload
): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;

  const logId = uuid();
  const pushPayload = JSON.stringify({
    title: `VoidDeckSafety: ${payload.event.replace(/_/g, " ").toUpperCase()}`,
    body: (payload.data as any)?.summary || `Threat event: ${payload.event}`,
    data: payload,
  });

  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      pushPayload
    );

    await db.insert(alertLog).values({
      id: logId,
      type: "push",
      targetId: subscription.id,
      eventType: payload.event,
      payload: payload as any,
      status: "sent",
      createdAt: new Date(),
    });
  } catch (err: any) {
    // If subscription is expired/invalid, remove it
    if (err.statusCode === 410 || err.statusCode === 404) {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, subscription.id));
    }

    await db.insert(alertLog).values({
      id: logId,
      type: "push",
      targetId: subscription.id,
      eventType: payload.event,
      payload: payload as any,
      status: "failed",
      error: err.message?.slice(0, 500),
      createdAt: new Date(),
    });
  }
}

// ─── Dispatch alert to all subscribers ────────────────────

export async function dispatchAlert(
  eventType: AlertEventType,
  data: Record<string, unknown>
): Promise<void> {
  const payload: WebhookPayload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    data,
  };

  // Find all active webhooks subscribed to this event
  const allWebhooks = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.active, true));

  const matchingWebhooks = allWebhooks.filter((wh) => {
    const events = wh.events as string[];
    return events.includes(eventType) || events.includes("*");
  });

  // Find all push subscriptions
  const allPush = await db.select().from(pushSubscriptions);

  // Deliver in parallel (fire-and-forget, errors logged)
  const promises: Promise<void>[] = [];

  for (const wh of matchingWebhooks) {
    promises.push(deliverWebhook(wh, payload));
  }

  for (const sub of allPush) {
    promises.push(deliverPush(sub, payload));
  }

  await Promise.allSettled(promises);
}

// ─── VAPID public key for client ──────────────────────────
export function getVapidPublicKey(): string {
  return env.VAPID_PUBLIC_KEY;
}
