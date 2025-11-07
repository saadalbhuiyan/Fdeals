"use strict";

/**
 * User OTP Auth Controller
 * Routes:
 *   POST   /auth/otp/request
 *   POST   /auth/otp/verify
 *   POST   /auth/refresh
 *   POST   /auth/logout
 *   DELETE /auth/account
 */

import validator from "validator";
import nodemailer from "nodemailer";
import SmtpConfig from "../models/SmtpConfig.js";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import {
  signAccessToken,
  createSession,
  rotateSession,
  setRefreshCookie,
  clearRefreshCookie,
  revokeAllSessionsForSubject
} from "../../../utils/jwt.js";

/* --------------------------- constants & config --------------------------- */
const OTP_TTL_MS = 180 * 1000;           // 3 minutes
const OTP_LEN = 6;
const RESEND_COOLDOWN_MS = 60 * 1000;    // 60 seconds
const CSRF_COOKIE = process.env.CSRF_COOKIE_NAME || "csrf";
const CSRF_HEADER = process.env.CSRF_HEADER_NAME || "X-CSRF-Token";

/* ------------------------------- in-memory ------------------------------- */
if (!global.__otpStore) global.__otpStore = new Map();      // email -> { code, exp, attempts }
if (!global.__otpCooldown) global.__otpCooldown = new Map(); // email -> cooldownUntil
if (!global.__otpIpCount) global.__otpIpCount = new Map();   // ip -> { hourStart, count }

/* --------------------------------- utils --------------------------------- */
function assertCsrf(req) {
  const cookies = req && req.cookies ? req.cookies : {};
  const headers = req && req.headers ? req.headers : {};
  const cookie = cookies[CSRF_COOKIE];
  const header = headers[CSRF_HEADER.toLowerCase()];
  if (!cookie || !header || cookie !== header) {
    const err = new Error("CSRF validation failed");
    err.status = 401;
    throw err;
  }
}

function randomOtp() {
  return String(Math.floor(Math.random() * Math.pow(10, OTP_LEN))).padStart(OTP_LEN, "0");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeMobile(m) {
  if (!m) return null;
  let s = String(m).trim();
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    s = "+" + digits;
  } else {
    s = s.replace(/\D/g, "");
  }
  if (s.length < 7 || s.length > 20) return null;
  return s;
}

/**
 * Resolve latest SMTP config and return a nodemailer transporter.
 * Throws 422 if SMTP is not configured.
 */
async function getActiveSmtpTransport(existingCfg) {
  const cfg = existingCfg || (await SmtpConfig.findOne().sort({ createdAt: -1 }));
  if (!cfg) {
    const err = new Error("SMTP not configured");
    err.status = 422;
    err.publicMessage = "SMTP not configured";
    throw err;
  }
  const port = Number(cfg.port);
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port,
    secure: port === 465, // SMTPS on 465
    auth: { user: cfg.username, pass: cfg.password },
    connectionTimeout: 8000
  });
  return transporter;
}

/* ============================ Main controller functions ============================ */

// POST /auth/otp/request
export async function otpRequest(req, res) {
  try {
    const body = req && req.body ? req.body : {};
    const email = normalizeEmail(body.email);

    if (!validator.isEmail(email)) {
      // Uniform response to prevent probing
      return res.json({ ok: true });
    }

    // SMTP must be configured
    const cfg = await SmtpConfig.findOne().sort({ createdAt: -1 });
    if (!cfg) {
      return res.status(422).json({ ok: false, code: 422, message: "SMTP not configured" });
    }

    // Rate limits
    const ip = (req && req.ip) || "";
    const now = Date.now();

    // Per-email cooldown
    const until = global.__otpCooldown.get(email) || 0;
    if (until > now) return res.json({ ok: true });

    // Per-IP hourly cap (10 requests/hour)
    const st = global.__otpIpCount.get(ip) || { hourStart: now, count: 0 };
    if (now - st.hourStart >= 60 * 60 * 1000) { st.hourStart = now; st.count = 0; }
    if (st.count >= 10) return res.json({ ok: true });
    st.count += 1;
    global.__otpIpCount.set(ip, st);

    // Create & store OTP (single-use)
    const code = randomOtp();
    global.__otpStore.set(email, { code, exp: now + OTP_TTL_MS, attempts: 0 });

    // Send email
    try {
      const transporter = await getActiveSmtpTransport(cfg);
      const from = cfg.username;
      await transporter.sendMail({
        from,
        to: email,
        subject: "Your F Deals OTP Code",
        text: "Your OTP is " + code + ". It expires in 3 minutes.",
        html: "<p>Your OTP is <b>" + code + "</b>. It expires in 3 minutes.</p>"
      });
    } catch (e) {
      try { global.__otpStore.delete(email); } catch (ignore) {}
      console.error("[SMTP sendMail error]", {
        name: e && e.name, code: e && e.code, responseCode: e && e.responseCode,
        command: e && e.command, message: e && e.message
      });
      return res.status(503).json({ ok: false, code: 503, message: "SMTP temporarily unavailable" });
    }

    // Set per-email cooldown
    global.__otpCooldown.set(email, now + RESEND_COOLDOWN_MS);

    return res.json({ ok: true });
  } catch (e) {
    const status = (e && e.status) || 500;
    return res.status(status).json({
      ok: false,
      code: status,
      message: (e && (e.publicMessage || e.message)) || "Failed to request OTP"
    });
  }
}

// POST /auth/otp/verify
export async function otpVerify(req, res) {
  try {
    const body = req && req.body ? req.body : {};
    const email = normalizeEmail(body.email);
    const code = String(body.otp || "");

    if (!validator.isEmail(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid input" });
    }

    const rec = global.__otpStore.get(email);
    const now = Date.now();

    if (!rec) {
      return res.status(410).json({ ok: false, code: 410, message: "OTP expired/used" });
    }
    if (now > rec.exp) {
      global.__otpStore.delete(email);
      return res.status(410).json({ ok: false, code: 410, message: "OTP expired/used" });
    }
    if (rec.attempts >= 5) {
      global.__otpStore.delete(email);
      return res.status(410).json({ ok: false, code: 410, message: "OTP expired/used" });
    }

    rec.attempts += 1;
    if (code !== rec.code) {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid OTP" });
    }

    // Consume OTP
    global.__otpStore.delete(email);

    // Ensure user
    let user = await User.findOne({ email });
    if (!user) user = await User.create({ email });

    // Issue tokens
    const accessToken = signAccessToken(user._id, "user");
    const userAgent = req && req.headers ? req.headers["user-agent"] : undefined;
    const ip = (req && req.ip) || "";
    const session = await createSession({
      subjectId: user._id,
      role: "user",
      userAgent: userAgent,
      ip: ip
    });
    const sid = session.sid;
    const refresh = session.token;

    setRefreshCookie(res, refresh);

    return res.json({ ok: true, accessToken, sid });
  } catch (e) {
    const status = (e && e.status) || 500;
    return res.status(status).json({
      ok: false,
      code: status,
      message: (e && (e.publicMessage || e.message)) || "Failed to verify OTP"
    });
  }
}

// POST /auth/refresh
export async function refresh(req, res) {
  try {
    assertCsrf(req);

    const cookies = req && req.cookies ? req.cookies : {};
    const rt = cookies.rt;
    if (!rt) {
      return res.status(401).json({ ok: false, code: 401, message: "Unauthorized" });
    }

    const userAgent = req && req.headers ? req.headers["user-agent"] : undefined;
    const ip = (req && req.ip) || "";

    const rotated = await rotateSession(rt, { userAgent, ip });
    const newSid = rotated.newSid;
    const newToken = rotated.newToken;
    const payload = rotated.payload;

    setRefreshCookie(res, newToken);

    const accessToken = signAccessToken(payload.sub, "user");
    return res.json({ ok: true, accessToken, sid: newSid });
  } catch (e) {
    const status = (e && e.status) || 401;
    return res.status(status).json({
      ok: false,
      code: status,
      message: (e && (e.publicMessage || e.message)) || "CSRF failed or token invalid"
    });
  }
}

// POST /auth/logout
export async function logout(req, res) {
  try {
    assertCsrf(req);

    // Best-effort revoke by token hash (if cookie present)
    try {
      const cookies = req && req.cookies ? req.cookies : {};
      const rt = cookies.rt;
      if (rt) {
        await RefreshToken.updateMany(
          { tokenHash: String(hash(rt)), revokedAt: null },
          { $set: { revokedAt: new Date() } }
        );
      }
    } catch (ignore) { /* ignore revoke errors */ }

    clearRefreshCookie(res);
    return res.json({ ok: true });
  } catch (e) {
    const status = (e && e.status) || 401;
    return res.status(status).json({
      ok: false,
      code: status,
      message: (e && (e.publicMessage || e.message)) || "CSRF failed"
    });
  }
}

// DELETE /auth/account
export async function deleteAccount(req, res) {
  try {
    assertCsrf(req);

    const auth = req ? req.auth : undefined;
    const body = req && req.body ? req.body : {};
    const emailInput = body.email;
    const email = normalizeEmail(emailInput);
    let user = null;

    if (email) user = await User.findOne({ email });
    if (!user && auth && auth.sub) user = await User.findById(auth.sub);
    if (!user) {
      return res.status(404).json({ ok: false, code: 404, message: "User not found" });
    }

    await revokeAllSessionsForSubject(user._id, "user");
    await User.deleteOne({ _id: user._id });

    clearRefreshCookie(res);
    return res.json({ ok: true });
  } catch (e) {
    const status = (e && e.status) || 500;
    return res.status(status).json({
      ok: false,
      code: status,
      message: (e && (e.publicMessage || e.message)) || "Failed to delete account"
    });
  }
}

/* ------------------------------ local helpers ----------------------------- */
function hash(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return h;
}
