import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  findUserByEmail,
  verifyPassword,
  createTokenPair,
  refreshTokenPair,
  revokeSession,
  revokeAllUserSessions,
  createUser,
} from "../services/auth.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { UserPayload, UserRole } from "../types/index.js";

const router = Router();

// ─── POST /auth/login ─────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const user = await findUserByEmail(email);
    if (!user || !user.active) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const payload: UserPayload = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      displayName: user.displayName,
    };

    const tokens = await createTokenPair(payload);
    res.json({
      user: payload,
      ...tokens,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── POST /auth/register ──────────────────────────────────
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      res
        .status(400)
        .json({ error: "Email, password, and displayName required" });
      return;
    }

    if (password.length < 6) {
      res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
      return;
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    // New users get 'viewer' role by default
    const user = await createUser(email, password, displayName, "viewer");
    const payload: UserPayload = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      displayName: user.displayName,
    };

    const tokens = await createTokenPair(payload);
    res.status(201).json({
      user: payload,
      ...tokens,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ─── POST /auth/refresh ───────────────────────────────────
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token required" });
      return;
    }

    const tokens = await refreshTokenPair(refreshToken);
    if (!tokens) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    res.json(tokens);
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// ─── POST /auth/logout ────────────────────────────────────
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await revokeSession(refreshToken);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Logout failed" });
  }
});

// ─── GET /auth/me ─────────────────────────────────────────
router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// ─── Admin: list users ────────────────────────────────────
router.get(
  "/users",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          active: users.active,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users);
      res.json(allUsers);
    } catch (err) {
      res.status(500).json({ error: "Failed to list users" });
    }
  }
);

// ─── Admin: update user role/active ───────────────────────
router.patch(
  "/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { role, active } = req.body;
      const updates: Record<string, unknown> = {};
      if (role) updates.role = role;
      if (typeof active === "boolean") updates.active = active;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "Nothing to update" });
        return;
      }

      await db.update(users).set(updates).where(eq(users.id, req.params.id as string));

      // If deactivated, revoke all sessions
      if (active === false) {
        await revokeAllUserSessions(req.params.id as string);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update user" });
    }
  }
);

export default router;
