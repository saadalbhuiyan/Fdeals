"use strict";

/**
 * User OTP auth:
 * - /auth/otp/request  (rate-limited; uniform response)
 * - /auth/otp/verify   (create user if new)
 * - /auth/refresh      (CSRF; rotate)
 * - /auth/logout       (CSRF; revoke)
 * - /auth/account      (DELETE: hard delete + revoke all)
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

const OTP_TTL_MS = 180 * 1000; // 3 min
const OTP_LEN = 6;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60s
const CSRF_COOKIE = process.env.CSRF_COOKIE_NAME || "csrf";
const CSRF_HEADER = process.env.CSRF_HEADER_NAME || "X-CSRF-Token";

// In-memory stores
if (!global.__otpStore) global.__otpStore = new Map(); // key=email -> {code, exp, attempts}
if (!global.__otpCooldown) global.__otpCooldown = new Map(); // key=email/ip -> until
if (!global.__otpIpCount) global.__otpIpCount = new Map(); // key=ip -> {hourStart, count}

function assertCsrf(req) {
  const cookie = req.cookies[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER.toLowerCase()];
  if (!cookie || !header || cookie !== header) {
    const err = new Error("CSRF validation failed");
    err.status = 401;
    throw err;
  }
}

function randomOtp() {
  return String(Math.floor(Math.random() * 10 ** OTP_LEN)).padStart(OTP_LEN, "0");
}

async function getActiveSmtpTransport() {
  const cfg = await SmtpConfig.findOne({ isActive: true });
  if (!cfg) {
    const err = new Error("SMTP not configured");
    err.status = 422;
    err.publicMessage = "SMTP not configured";
    throw err;
  }
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port),
    secure: Number(cfg.port) === 465,
    auth: { user: cfg.username, pass: cfg.getPassword() },
    connectionTimeout: 8000
  });
  return transporter;
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

export default {
  // POST /auth/otp/request
  async otpRequest(req, res) {
    const email = normalizeEmail(req.body?.email);
    if (!validator.isEmail(email)) {
      // uniform response to prevent probing
      return res.json({ ok: true });
    }

    // Guard: SMTP configured?
    const active = await SmtpConfig.findOne({ isActive: true });
    if (!active) return res.status(422).json({ ok: false, code: 422, message: "SMTP not configured" });

    // Rate limits:
    const ip = req.ip;
    const now = Date.now();

    // per email cooldown
    const until = (global.__otpCooldown.get(email) || 0);
    if (until > now) return res.json({ ok: true }); // uniform

    // per IP hourly
    const st = global.__otpIpCount.get(ip) || { hourStart: now, count: 0 };
    if (now - st.hourStart >= 60 * 60 * 1000) { st.hourStart = now; st.count = 0; }
    if (st.count >= 10) return res.json({ ok: true }); // uniform cap 10/hr per IP
    st.count += 1;
    global.__otpIpCount.set(ip, st);

    // Create & store OTP
    const code = randomOtp();
    global.__otpStore.set(email, { code, exp: now + OTP_TTL_MS, attempts: 0 });

    // Send email
    try {
      const transporter = await getActiveSmtpTransport();
      const from = active.username;
      await transporter.sendMail({
        from,
        to: email,
        subject: "Your F Deals OTP Code",
        text: `Your OTP is ${code}. It expires in 3 minutes.`,
        html: `<p>Your OTP is <b>${code}</b>. It expires in 3 minutes.</p>`
      });
    } catch (e) {
      return res.status(503).json({ ok: false, code: 503, message: "SMTP temporarily unavailable" });
    }

    // set cooldown
    global.__otpCooldown.set(email, now + RESEND_COOLDOWN_MS);

    return res.json({ ok: true });
  },

  // POST /auth/otp/verify
  async otpVerify(req, res) {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.otp || "");
    if (!validator.isEmail(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid input" });
    }

    const rec = global.__otpStore.get(email);
    const now = Date.now();
    if (!rec) return res.status(410).json({ ok: false, code: 410, message: "OTP expired/used" });
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

    // single-use
    global.__otpStore.delete(email);

    // Ensure user
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ email });
    }

    // issue tokens
    const access = signAccessToken(user._id, "user");
    const { sid, token: refresh } = await createSession({
      subjectId: user._id,
      role: "user",
      userAgent: req.headers["user-agent"],
      ip: req.ip
    });
    setRefreshCookie(res, refresh);

    return res.json({ ok: true, accessToken: access, sid });
  },

  // POST /auth/refresh
  async refresh(req, res) {
    const cookie = req.cookies[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER.toLowerCase()];
    if (!cookie || !header || cookie !== header) {
      return res.status(401).json({ ok: false, code: 401, message: "CSRF failed" });
    }
    const rt = req.cookies?.rt;
    if (!rt) return res.status(401).json({ ok: false, code: 401, message: "Unauthorized" });

    const { newSid, newToken, payload } = await rotateSession(rt, {
      userAgent: req.headers["user-agent"],
      ip: req.ip
    });

    setRefreshCookie(res, newToken);

    const access = signAccessToken(payload.sub, "user");
    return res.json({ ok: true, accessToken: access, sid: newSid });
  },

  // POST /auth/logout
  async logout(req, res) {
    const cookie = req.cookies[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER.toLowerCase()];
    if (!cookie || !header || cookie !== header) {
      return res.status(401).json({ ok: false, code: 401, message: "CSRF failed" });
    }
    // Best-effort clear + revoke by token hash (optional)
    try {
      const rt = req.cookies?.rt;
      if (rt) {
        await RefreshToken.updateMany({ tokenHash: String(hash(rt)), revokedAt: null }, { $set: { revokedAt: new Date() } });
      }
    } catch { /* ignore */ }
    clearRefreshCookie(res);
    return res.json({ ok: true });
  },

  // DELETE /auth/account
  async deleteAccount(req, res) {
    const cookie = req.cookies[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER.toLowerCase()];
    if (!cookie || !header || cookie !== header) {
      return res.status(401).json({ ok: false, code: 401, message: "CSRF failed" });
    }

    const auth = req.auth; // from authUser middleware if you choose to protect; here we'll just rely on tokens if used
    // Expect Authorization Bearer to be used for identity in client app when calling this
    // For simplicity, delete by email param too (optional):
    const email = normalizeEmail(req.body?.email);
    let user = null;
    if (email) user = await User.findOne({ email });
    if (!user && auth?.sub) user = await User.findById(auth.sub);
    if (!user) return res.status(404).json({ ok: false, code: 404, message: "User not found" });

    // revoke all sessions
    await revokeAllSessionsForSubject(user._id, "user");
    // cleanup user media best-effort (picture path is stored if any)
    // Picture removal handled in profile controller; here we just delete the row
    await User.deleteOne({ _id: user._id });

    clearRefreshCookie(res);
    return res.json({ ok: true });
  }
};

function hash(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return h;
}
