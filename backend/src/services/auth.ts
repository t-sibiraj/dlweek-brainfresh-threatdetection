import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { users, sessions } from "../db/schema.js";
import { eq, and, gt } from "drizzle-orm";
import { env } from "../config/env.js";
import type { UserPayload, TokenPair, UserRole } from "../types/index.js";

const SALT_ROUNDS = 12;

// ─── Password ─────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT ──────────────────────────────────────────────────
export function generateAccessToken(payload: UserPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  } as jwt.SignOptions);
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function verifyAccessToken(token: string): UserPayload {
  return jwt.verify(token, env.JWT_SECRET) as UserPayload;
}

// ─── Token Pair ───────────────────────────────────────────
export async function createTokenPair(
  user: UserPayload
): Promise<TokenPair> {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  // Calculate refresh expiry (default 7d)
  const match = env.JWT_REFRESH_EXPIRES.match(/^(\d+)([dhms])$/);
  let expiresMs = 7 * 24 * 60 * 60 * 1000; // 7d default
  if (match) {
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    expiresMs = num * (multipliers[unit] || expiresMs);
  }

  // Store refresh token in DB
  await db.insert(sessions).values({
    id: uuid(),
    userId: user.id,
    refreshToken,
    expiresAt: new Date(Date.now() + expiresMs),
    createdAt: new Date(),
  });

  return { accessToken, refreshToken };
}

// ─── Refresh ──────────────────────────────────────────────
export async function refreshTokenPair(
  oldRefreshToken: string
): Promise<TokenPair | null> {
  // Find valid session
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.refreshToken, oldRefreshToken),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) return null;

  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.active, true)))
    .limit(1);

  if (!user) return null;

  // Delete old session
  await db.delete(sessions).where(eq(sessions.id, session.id));

  // Create new pair
  const payload: UserPayload = {
    id: user.id,
    email: user.email,
    role: user.role as UserRole,
    displayName: user.displayName,
  };

  return createTokenPair(payload);
}

// ─── Session cleanup ──────────────────────────────────────
export async function revokeSession(refreshToken: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.refreshToken, refreshToken));
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// ─── User lookup ──────────────────────────────────────────
export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return user ?? null;
}

export async function findUserById(id: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}

// ─── User management ─────────────────────────────────────
export async function createUser(
  email: string,
  password: string,
  displayName: string,
  role: UserRole = "viewer"
) {
  const passwordHash = await hashPassword(password);
  const id = uuid();
  await db.insert(users).values({
    id,
    email: email.toLowerCase(),
    passwordHash,
    displayName,
    role,
    active: true,
    createdAt: new Date(),
  });
  return { id, email: email.toLowerCase(), displayName, role };
}
