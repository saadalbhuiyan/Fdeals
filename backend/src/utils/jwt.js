"use strict";

/**
 * Beginner-friendly JWT + Refresh Rotation helpers
 * ------------------------------------------------
 * What this file does:
 * - Creates short-lived access tokens (JWT)
 * - Creates / verifies / rotates refresh tokens stored in httpOnly cookies
 * - Tracks refresh tokens in DB by session id (sid) and simple hash
 *
 * Key ideas:
 * - Access token = quick expiry, used on each request
 * - Refresh token = long expiry, stored in cookie; we rotate it per refresh
 */

import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import RefreshToken from "../modules/auth/models/RefreshToken.js";

// Env-driven config (provide sane defaults for TTLs)
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "10m";
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || "30d";
const ACCESS_DENY_BEFORE = Number(process.env.ACCESS_DENY_BEFORE || 0);

/* -------------------------------------------------------------------------- */
/*                              Access token (JWT)                             */
/* -------------------------------------------------------------------------- */

// Create a signed access token (short TTL). Payload includes subject id + role.
export function signAccessToken(subjectId, role, extra = {}) {
  const payload = { sub: String(subjectId), role, ...extra };
  // NOTE: throws if ACCESS_SECRET is missing/invalid
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

// Verify access token and optionally reject tokens issued before a timestamp.
export function verifyAccessToken(token) {
  const payload = jwt.verify(token, ACCESS_SECRET); // throws if invalid/expired

  // Optional global revoke: if token was issued (iat) before ACCESS_DENY_BEFORE
  if (ACCESS_DENY_BEFORE && payload.iat * 1000 < ACCESS_DENY_BEFORE) {
    const err = new Error("Token revoked");
    err.status = 401;
    throw err;
  }
  return payload; // { sub, role, iat, exp, ... }
}

/* -------------------------------------------------------------------------- */
/*                             Refresh token (JWT)                             */
/* -------------------------------------------------------------------------- */

// Create a signed refresh token that carries session id (sid).
export function signRefreshToken(subjectId, role, sid) {
  const payload = { sub: String(subjectId), role, sid };
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

// Verify refresh token signature/expiry and return its payload.
export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET); // throws if invalid/expired
}

/* -------------------------------------------------------------------------- */
/*                      Session lifecycle (DB + rotation)                      */
/* -------------------------------------------------------------------------- */

/**
 * Create a new session:
 * 1) make a fresh sid
 * 2) sign a refresh token with that sid
 * 3) store a hash of the token in DB (so we never store raw tokens)
 * 4) return { sid, token }
 */
export async function createSession({ subjectId, role, userAgent, ip }) {
  const sid = uuidv4();
  const token = signRefreshToken(subjectId, role, sid);

  await RefreshToken.create({
    sid,
    subjectId,
    role,
    tokenHash: hashToken(token),              // lightweight hash for lookup
    ua: userAgent?.slice(0, 200) || "",
    ip: ip || "",
    createdAt: new Date(),
    rotatedAt: null,
    revokedAt: null
  });

  return { sid, token };
}

/**
 * Rotate a session:
 * 1) verify old refresh token
 * 2) find active session by sid
 * 3) compare stored hash with provided token
 * 4) revoke old record
 * 5) create a brand new session + refresh token
 */
export async function rotateSession(oldToken, { userAgent, ip }) {
  const payload = verifyRefreshToken(oldToken);

  const session = await RefreshToken.findOne({ sid: payload.sid, revokedAt: null });
  if (!session) {
    const err = new Error("Invalid session");
    err.status = 401;
    throw err;
  }

  // Provided token must match DB hash (prevents reuse from other devices)
  if (session.tokenHash !== hashToken(oldToken)) {
    const err = new Error("Refresh token mismatch");
    err.status = 401;
    throw err;
  }

  // Revoke old
  session.revokedAt = new Date();
  await session.save();

  // Create a fresh session+token (rotation)
  const { sid, token } = await createSession({
    subjectId: payload.sub,
    role: payload.role,
    userAgent,
    ip
  });

  return { payload, newSid: sid, newToken: token };
}

// Revoke a single session by its sid
export async function revokeSessionBySid(sid) {
  await RefreshToken.updateOne({ sid }, { $set: { revokedAt: new Date() } });
}

// Revoke all sessions for a user+role (e.g., account deletion / force logout)
export async function revokeAllSessionsForSubject(subjectId, role) {
  await RefreshToken.updateMany(
    { subjectId, role, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

/* -------------------------------------------------------------------------- */
/*                                Cookies (rt)                                */
/* -------------------------------------------------------------------------- */

/**
 * Set the httpOnly refresh token cookie.
 * - secure + sameSite are chosen for production safety
 * - domain is optional (via env)
 */
export function setRefreshCookie(res, token) {
  const secure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  const domain = process.env.COOKIE_DOMAIN || undefined;

  res.cookie("rt", token, {
    httpOnly: true,                   // not readable by JS
    secure,                           // only over HTTPS in prod
    sameSite: secure ? "strict" : "lax",
    domain,                           // optional cookie domain
    path: "/",
    maxAge: 30 * 24 * 3600 * 1000     // 30 days in ms (cookie lifetime)
  });
}

// Clear the refresh token cookie (logs the browser out locally)
export function clearRefreshCookie(res) {
  const secure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  const domain = process.env.COOKIE_DOMAIN || undefined;

  res.clearCookie("rt", {
    httpOnly: true,
    secure,
    sameSite: secure ? "strict" : "lax",
    domain,
    path: "/"
  });
}

/* -------------------------------------------------------------------------- */
/*                              Small hash helper                              */
/* -------------------------------------------------------------------------- */

/**
 * hashToken(t): tiny deterministic hash for DB lookups
 * - Not a security hash; tokens are already signed & long/unguessable
 * - Purpose: avoid storing raw refresh tokens while still comparing quickly
 */
function hashToken(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) {
    h = (h * 31 + t.charCodeAt(i)) | 0; // simple 32-bit rolling hash
  }
  return String(h);
}
