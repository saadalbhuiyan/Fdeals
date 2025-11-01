"use strict";

/**
 * Admin SMTP Controller (Single Record, Partial Update)
 * - create: সব ফিল্ড লাগে (host, port, username, password) + verify
 * - read: একটাই রেকর্ড রিটার্ন
 * - update: আংশিক (যা পাঠাবে শুধু সেটাই আপডেট) + merged verify
 * - remove: রেকর্ড ডিলিট
 */

import SmtpConfig from "../models/SmtpConfig.js";
import nodemailer from "nodemailer";

// Verify credentials (throws on failure)
async function testSmtp({ host, port, username, password }) {
  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user: username, pass: password },
    connectionTimeout: 8000
  });
  await transporter.verify();
}

export default {
  // POST /admin/smtp  -> create/replace (all fields required)
  async create(req, res) {
    const { host, port, username, password } = req.body || {};
    if (!host || !port || !username || !password) {
      return res.status(400).json({
        ok: false,
        code: 400,
        message: "host, port, username, and password are required"
      });
    }

    await testSmtp({ host, port, username, password });

    // keep only one record
    await SmtpConfig.deleteMany({});
    const cfg = await SmtpConfig.create({ host, port, username, password });
    return res.status(201).json({ ok: true, smtp: cfg });
  },

  // GET /admin/smtp
  async read(req, res) {
    const cfg = await SmtpConfig.findOne().sort({ createdAt: -1 });
    if (!cfg) return res.status(404).json({ ok: false, code: 404, message: "SMTP not configured" });
    return res.json({ ok: true, smtp: cfg });
  },

  // PUT /admin/smtp  -> PARTIAL UPDATE (any subset of fields)
  async update(req, res) {
    const { host, port, username, password } = req.body || {};

    const cfg = await SmtpConfig.findOne().sort({ createdAt: -1 });
    if (!cfg) {
      return res.status(404).json({ ok: false, code: 404, message: "SMTP not configured" });
    }

    // At least one field must be provided
    const hasAny =
      typeof host !== "undefined" ||
      typeof port !== "undefined" ||
      typeof username !== "undefined" ||
      typeof password !== "undefined";

    if (!hasAny) {
      return res.status(400).json({
        ok: false,
        code: 400,
        message: "Provide at least one field to update (host/port/username/password)"
      });
    }

    // Build merged credentials for verification
    const merged = {
      host: typeof host !== "undefined" ? host : cfg.host,
      port: typeof port !== "undefined" ? Number(port) : cfg.port,
      username: typeof username !== "undefined" ? username : cfg.username,
      password: typeof password !== "undefined" ? password : cfg.password
    };

    // Verify merged creds before saving
    await testSmtp(merged);

    // Apply only provided fields
    if (typeof host !== "undefined") cfg.host = host;
    if (typeof port !== "undefined") cfg.port = Number(port);
    if (typeof username !== "undefined") cfg.username = username;
    if (typeof password !== "undefined") cfg.password = password;

    await cfg.save();
    return res.json({ ok: true, smtp: cfg });
  },

  // DELETE /admin/smtp
  async remove(req, res) {
    const cfg = await SmtpConfig.findOne();
    if (!cfg) {
      return res.status(404).json({ ok: false, code: 404, message: "SMTP not configured" });
    }
    await SmtpConfig.deleteOne({ _id: cfg._id });
    return res.json({ ok: true, message: "SMTP configuration deleted" });
  }
};
