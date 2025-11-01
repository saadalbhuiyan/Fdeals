"use strict";

/**
 * Admin auth
 * - login via ENV ADMIN_EMAIL + ADMIN_PASSWORD
 * - refresh with CSRF (cookie + header)
 * - logout revokes current sid
 */

import bcrypt from "bcryptjs";
import Admin from "../models/Admin.js";
import RefreshToken from "../models/RefreshToken.js";
import {
  signAccessToken,
  createSession,
  rotateSession,
  setRefreshCookie,
  clearRefreshCookie
} from "../../../utils/jwt.js";

const CSRF_COOKIE = process.env.CSRF_COOKIE_NAME || "csrf";
const CSRF_HEADER = process.env.CSRF_HEADER_NAME || "X-CSRF-Token";

function sameSiteSecure() {
  return (process.env.COOKIE_SECURE === "true") || process.env.NODE_ENV === "production";
}

function assertCsrf(req) {
  const cookie = req.cookies[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER.toLowerCase()];
  if (!cookie || !header || cookie !== header) {
    const err = new Error("CSRF validation failed");
    err.status = 401;
    throw err;
  }
}

export default {
  // POST /admin/auth/login
  async login(req, res) {
    // ✅ Step 1: Validate input
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid input" });
    }

    // ✅ Step 2: Compare with ENV
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    const emailOk = email.toLowerCase().trim() === String(ADMIN_EMAIL).toLowerCase().trim();

    // We allow ADMIN_PASSWORD to be plain or bcrypt hash for runtime comparison
    let passOk = false;
    if (ADMIN_PASSWORD?.startsWith("$2a$") || ADMIN_PASSWORD?.startsWith("$2b$")) {
      passOk = await bcrypt.compare(password, ADMIN_PASSWORD);
    } else {
      passOk = password === ADMIN_PASSWORD;
    }

    // ✅ Step 3: Rate limits (basic per-IP lock)
    // (Simple in-memory; for production, use Redis)
    const ip = req.ip;
    if (!global.__adminLoginRL) global.__adminLoginRL = new Map();
    const rl = global.__adminLoginRL.get(ip) || { fails: 0, until: 0 };
    const now = Date.now();
    if (rl.until > now) {
      return res.status(429).json({ ok: false, code: 429, message: "Too many attempts. Try later." });
    }

    if (!emailOk || !passOk) {
      rl.fails += 1;
      if (rl.fails >= 5) {
        rl.until = now + 15 * 60 * 1000; // 15 min lock
        rl.fails = 0;
      }
      global.__adminLoginRL.set(ip, rl);
      return res.status(401).json({ ok: false, code: 401, message: "Invalid credentials" });
    }
    // reset on success
    global.__adminLoginRL.delete(ip);

    // ✅ Step 4: Ensure admin profile row exists (for name/picture)
    const emailNorm = ADMIN_EMAIL.toLowerCase().trim();
    let admin = await Admin.findOne({ email: emailNorm });
    if (!admin) {
      admin = await Admin.create({ email: emailNorm });
    }

    // ✅ Step 5: Session + tokens
    const access = signAccessToken(admin._id, "admin");
    const { sid, token: refresh } = await createSession({
      subjectId: admin._id,
      role: "admin",
      userAgent: req.headers["user-agent"],
      ip: req.ip
    });

    setRefreshCookie(res, refresh);

    return res.json({
      ok: true,
      accessToken: access,
      sid
    });
  },

  // POST /admin/auth/refresh
  async refresh(req, res) {
    assertCsrf(req);
    const rt = req.cookies?.rt;
    if (!rt) return res.status(401).json({ ok: false, code: 401, message: "Unauthorized" });

    const { newSid, newToken, payload } = await rotateSession(rt, {
      userAgent: req.headers["user-agent"],
      ip: req.ip
    });

    setRefreshCookie(res, newToken);

    const access = signAccessToken(payload.sub, "admin");
    return res.json({ ok: true, accessToken: access, sid: newSid });
  },

  // POST /admin/auth/logout
  async logout(req, res) {
    assertCsrf(req);
    const rt = req.cookies?.rt;
    if (!rt) {
      clearRefreshCookie(res);
      return res.json({ ok: true });
    }
    // revoke by sid
    try {
      const row = await RefreshToken.findOne({ tokenHash: String(hash(rt)) });
      if (row?.sid) {
        await RefreshToken.updateOne({ sid: row.sid }, { $set: { revokedAt: new Date() } });
      }
    } catch { /* ignore */ }
    clearRefreshCookie(res);
    return res.json({ ok: true });
  }
};

// lightweight hash for sid lookup
function hash(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return h;
}
