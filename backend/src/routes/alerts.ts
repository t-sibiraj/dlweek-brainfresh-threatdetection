import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import {
  webhookEndpoints,
  pushSubscriptions,
  alertLog,
} from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getVapidPublicKey } from "../services/alertService.js";

const router = Router();

// ─── Webhooks CRUD ────────────────────────────────────────

// List user's webhooks
router.get("/webhooks", requireAuth, async (req: Request, res: Response) => {
  try {
    const list = await db
      .select({
        id: webhookEndpoints.id,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        active: webhookEndpoints.active,
        createdAt: webhookEndpoints.createdAt,
      })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.userId, req.user!.id));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Failed to list webhooks" });
  }
});

// Create webhook
router.post("/webhooks", requireAuth, requireRole("admin", "operator"), async (req: Request, res: Response) => {
  try {
    const { url, events } = req.body;
    if (!url || !events || !Array.isArray(events)) {
      res
        .status(400)
        .json({ error: "url and events[] are required" });
      return;
    }

    const secret = crypto.randomBytes(32).toString("hex");
    const id = uuid();

    await db.insert(webhookEndpoints).values({
      id,
      userId: req.user!.id,
      url,
      secret,
      events,
      active: true,
      createdAt: new Date(),
    });

    res.status(201).json({ id, url, secret, events });
  } catch (err) {
    res.status(500).json({ error: "Failed to create webhook" });
  }
});

// Update webhook
router.patch("/webhooks/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { url, events, active } = req.body;
    const updates: Record<string, unknown> = {};
    if (url) updates.url = url;
    if (events) updates.events = events;
    if (typeof active === "boolean") updates.active = active;

    await db
      .update(webhookEndpoints)
      .set(updates)
      .where(eq(webhookEndpoints.id, req.params.id as string));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update webhook" });
  }
});

// Delete webhook
router.delete("/webhooks/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    await db
      .delete(webhookEndpoints)
      .where(eq(webhookEndpoints.id, req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete webhook" });
  }
});

// ─── Push Subscriptions ───────────────────────────────────

// Get VAPID public key
router.get("/push/vapid-key", (_req: Request, res: Response) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// Subscribe to push
router.post("/push/subscribe", requireAuth, async (req: Request, res: Response) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res
        .status(400)
        .json({ error: "Push subscription object required" });
      return;
    }

    const id = uuid();
    await db.insert(pushSubscriptions).values({
      id,
      userId: req.user!.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      createdAt: new Date(),
    });

    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// Unsubscribe from push
router.delete("/push/subscribe/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.id, req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to unsubscribe" });
  }
});

// ─── Alert Log ────────────────────────────────────────────

router.get("/log", requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const logs = await db
      .select()
      .from(alertLog)
      .orderBy(desc(alertLog.createdAt))
      .limit(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Failed to list alert logs" });
  }
});

// Test webhook (sends a test payload)
router.post("/webhooks/:id/test", requireAuth, requireRole("admin", "operator"), async (req: Request, res: Response) => {
  try {
    const [wh] = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, req.params.id as string))
      .limit(1);

    if (!wh) {
      res.status(404).json({ error: "Webhook not found" });
      return;
    }

    const payload = JSON.stringify({
      event: "test",
      timestamp: new Date().toISOString(),
      data: { message: "Test webhook from VoidDeckSafety" },
    });

    const signature = crypto
      .createHmac("sha256", wh.secret)
      .update(payload)
      .digest("hex");

    const response = await fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VoidDeck-Signature": `sha256=${signature}`,
        "X-VoidDeck-Event": "test",
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });

    res.json({
      success: response.ok,
      status: response.status,
    });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

export default router;
