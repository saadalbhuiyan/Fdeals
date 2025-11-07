"use strict";

/* ----------------------------------------------------------
  Admin login / refresh / logout
  - credentials live in .env  (ADMIN_EMAIL, ADMIN_PASSWORD)
  - refresh token stored in http-only cookie  (name = rt)
  - CSRF double-submit cookie vs header
---------------------------------------------------------- */

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

/* ---------- tiny helpers -------------------------------- */
const CSRF_COOKIE = process.env.CSRF_COOKIE_NAME || "csrf";
const CSRF_HEADER = process.env.CSRF_HEADER_NAME || "X-CSRF-Token";

function isSecureCookie() {
  return (
    process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production"
  );
}

/* ---------- CSRF guard ----------------------------------- */
function guardCsrf(req) {
  const cookie = req.cookies[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER.toLowerCase()];
  if (!cookie || !header || cookie !== header) {
    const err = new Error("CSRF mismatch");
    err.status = 401;
    throw err;
  }
}

/* ---------- simple in-memory rate limiter -------------- */
const loginAttempts = new Map(); // ip → { fails, lockedUntil }

function isIpLocked(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() < record.lockedUntil) return true;
  loginAttempts.delete(ip); // lock expired
  return false;
}

function registerFail(ip) {
  const record = loginAttempts.get(ip) || { fails: 0, lockedUntil: 0 };
  record.fails += 1;
  if (record.fails >= 5) {
    record.fails = 0;
    record.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min
  }
  loginAttempts.set(ip, record);
}

function registerSuccess(ip) {
  loginAttempts.delete(ip);
}

/* ---- tiny hash for lookup ------------------------------ */
function quickHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++)
    h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return String(h);
}

/* ========================================================= */
/*                     CONTROLLERS                           */
/* ========================================================= */

// 🔹 POST /admin/auth/login
export async function login(req, res) {
  try {
    const email = req.body?.email?.trim().toLowerCase();
    const password = req.body?.password;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        message: "Email and password required"
      });
    }

    // Rate limit check
    if (isIpLocked(req.ip)) {
      return res.status(429).json({
        ok: false,
        message: "Too many attempts – try later"
      });
    }

    // 1️⃣ Compare email
    const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (email !== envEmail) {
      registerFail(req.ip);
      return res.status(401).json({ ok: false, message: "Bad credentials" });
    }

    // 2️⃣ Compare password
    const envPassword = process.env.ADMIN_PASSWORD;
    let passwordOK = false;

    if (envPassword?.startsWith("$2a$") || envPassword?.startsWith("$2b$")) {
      passwordOK = await bcrypt.compare(password, envPassword);
    } else {
      passwordOK = password === envPassword;
    }

    if (!passwordOK) {
      registerFail(req.ip);
      return res.status(401).json({ ok: false, message: "Bad credentials" });
    }

    // Reset rate limiter
    registerSuccess(req.ip);

    // 3️⃣ Ensure admin record exists
    let admin = await Admin.findOne({ email: envEmail });
    if (!admin) admin = await Admin.create({ email: envEmail });

    // 4️⃣ Create session + tokens
    const accessToken = signAccessToken(admin._id, "admin");
    const { sid, token: refreshToken } = await createSession({
      subjectId: admin._id,
      role: "admin",
      userAgent: req.headers["user-agent"],
      ip: req.ip
    });

    // 🍪 Set refresh token cookie
    setRefreshCookie(res, refreshToken);

    return res.json({ ok: true, accessToken, sid });
  } catch (err) {
    console.error("Error in login():", err);
    return res.status(err?.status || 500).json({
      ok: false,
      code: err?.status || 500,
      message: err?.message || "Failed to login"
    });
  }
}

// 🔹 POST /admin/auth/refresh
export async function refresh(req, res) {
  try {
    guardCsrf(req);

    const oldRefreshToken = req.cookies.rt;
    if (!oldRefreshToken) {
      return res
        .status(401)
        .json({ ok: false, message: "Missing refresh token" });
    }

    const { newSid, newToken, payload } = await rotateSession(oldRefreshToken, {
      userAgent: req.headers["user-agent"],
      ip: req.ip
    });

    setRefreshCookie(res, newToken);

    const accessToken = signAccessToken(payload.sub, "admin");

    return res.json({ ok: true, accessToken, sid: newSid });
  } catch (err) {
    console.error("Error in refresh():", err);
    return res.status(err?.status || 500).json({
      ok: false,
      code: err?.status || 500,
      message: err?.message || "Failed to refresh token"
    });
  }
}

// 🔹 POST /admin/auth/logout
export async function logout(req, res) {
  try {
    guardCsrf(req);

    const refreshToken = req.cookies.rt;
    if (refreshToken) {
      const hashed = quickHash(refreshToken);
      const row = await RefreshToken.findOne({ tokenHash: hashed });

      if (row?.sid) {
        await RefreshToken.updateMany(
          { sid: row.sid },
          { $set: { revokedAt: new Date() } }
        );
      }
    }

    clearRefreshCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error in logout():", err);
    return res.status(err?.status || 500).json({
      ok: false,
      code: err?.status || 500,
      message: err?.message || "Failed to logout"
    });
  }
}
   