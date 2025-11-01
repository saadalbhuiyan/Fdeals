"use strict";

/**
 * JWT + refresh rotation helpers
 * - Access: short TTL
 * - Refresh: cookie (httpOnly) + sid rotation
 */

import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import RefreshToken from "../modules/auth/models/RefreshToken.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "10m";
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || "30d";
const ACCESS_DENY_BEFORE = Number(process.env.ACCESS_DENY_BEFORE || 0);

export function signAccessToken(subjectId, role, extra = {}) {
  const payload = { sub: String(subjectId), role, ...extra };
  const token = jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
  return token;
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, ACCESS_SECRET);
  // optional deny-before
  if (ACCESS_DENY_BEFORE && payload.iat * 1000 < ACCESS_DENY_BEFORE) {
    const err = new Error("Token revoked");
    err.status = 401;
    throw err;
  }
  return payload;
}

export function signRefreshToken(subjectId, role, sid) {
  const payload = { sub: String(subjectId), role, sid };
  const token = jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
  return token;
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

export async function createSession({ subjectId, role, userAgent, ip }) {
  const sid = uuidv4();
  const token = signRefreshToken(subjectId, role, sid);
  const doc = await RefreshToken.create({
    sid,
    subjectId,
    role,
    tokenHash: hashToken(token),
    ua: userAgent?.slice(0, 200) || "",
    ip: ip || "",
    createdAt: new Date(),
    rotatedAt: null,
    revokedAt: null
  });
  return { sid, token };
}

export async function rotateSession(oldToken, { userAgent, ip }) {
  const payload = verifyRefreshToken(oldToken);
  const session = await RefreshToken.findOne({ sid: payload.sid, revokedAt: null });
  if (!session) {
    const err = new Error("Invalid session");
    err.status = 401;
    throw err;
  }
  // Verify token hash
  if (session.tokenHash !== hashToken(oldToken)) {
    const err = new Error("Refresh token mismatch");
    err.status = 401;
    throw err;
  }
  // Revoke old and create new
  session.revokedAt = new Date();
  await session.save();

  const { sid, token } = await createSession({
    subjectId: payload.sub,
    role: payload.role,
    userAgent,
    ip
  });
  return { payload, newSid: sid, newToken: token };
}

export async function revokeSessionBySid(sid) {
  await RefreshToken.updateOne({ sid }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllSessionsForSubject(subjectId, role) {
  await RefreshToken.updateMany({ subjectId, role, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export function setRefreshCookie(res, token) {
  const secure = (process.env.COOKIE_SECURE === "true") || process.env.NODE_ENV === "production";
  const domain = process.env.COOKIE_DOMAIN || undefined;
  res.cookie("rt", token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "strict" : "lax",
    domain,
    path: "/",
    maxAge: 30 * 24 * 3600 * 1000
  });
}

export function clearRefreshCookie(res) {
  const secure = (process.env.COOKIE_SECURE === "true") || process.env.NODE_ENV === "production";
  const domain = process.env.COOKIE_DOMAIN || undefined;
  res.clearCookie("rt", {
    httpOnly: true,
    secure,
    sameSite: secure ? "strict" : "lax",
    domain,
    path: "/"
  });
}

function hashToken(t) {
  // Lightweight deterministic hash (not security critical: token is already signed).
  let h = 0;
  for (let i = 0; i < t.length; i++) {
    h = (h * 31 + t.charCodeAt(i)) | 0;
  }
  return String(h);
}
