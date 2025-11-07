"use strict";

/**
 * Admin SMTP Controller (Single Record, Partial Update)
 * -----------------------------------------------------
 * Handles SMTP configuration CRUD for admin users.
 * Verifies SMTP credentials using nodemailer before saving.
 *
 * Routes:
 *   POST   /admin/smtp   -> create/replace config (verify first)
 *   GET    /admin/smtp   -> read latest config
 *   PUT    /admin/smtp   -> partial update (verify merged config)
 *   DELETE /admin/smtp   -> delete current config
 */

import SmtpConfig from "../models/SmtpConfig.js";
import nodemailer from "nodemailer";

/* ---------------------- small utility helpers ---------------------- */
function toNumber(value, fallback = undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Verify SMTP credentials by connecting to the server.
 * Throws if verification fails.
 */
async function verifySmtp(params) {
  const host = params && params.host;
  const port = params && params.port;
  const username = params && params.username;
  const password = params && params.password;

  const numericPort = toNumber(port);
  const transporter = nodemailer.createTransport({
    host: host,
    port: numericPort,
    secure: numericPort === 465, // SMTPS on 465 uses TLS
    auth: { user: username, pass: password },
    connectionTimeout: 8000
  });
  await transporter.verify();
}

/* ============================ Named Exports ============================ */

/**
 * POST /admin/smtp
 * Create or replace the single SMTP configuration.
 */
export async function create(req, res) {
  try {
    const body = req && req.body ? req.body : {};
    const host = body.host;
    const port = body.port;
    const username = body.username;
    const password = body.password;

    if (!host || !port || !username || !password) {
      return res
        .status(400)
        .json({
          ok: false,
          code: 400,
          message: "host, port, username, and password are required"
        });
    }

    await verifySmtp({ host, port, username, password });
    await SmtpConfig.deleteMany({});

    const cfg = await SmtpConfig.create({
      host: host,
      port: toNumber(port),
      username: username,
      password: password
    });

    return res.status(201).json({ ok: true, smtp: cfg });
  } catch (e) {
    return res
      .status(500)
      .json({
        ok: false,
        code: 500,
        message: (e && e.message) || "Failed to create SMTP configuration"
      });
  }
}

/**
 * GET /admin/smtp
 * Fetch the latest (single) SMTP configuration.
 */
export async function read(req, res) {
  try {
    const cfg = await SmtpConfig.findOne().sort({ createdAt: -1 });

    if (!cfg) {
      return res
        .status(404)
        .json({ ok: false, code: 404, message: "SMTP not configured" });
    }

    return res.json({ ok: true, smtp: cfg });
  } catch (e) {
    return res
      .status(500)
      .json({
        ok: false,
        code: 500,
        message: (e && e.message) || "Failed to read SMTP configuration"
      });
  }
}

/**
 * PUT /admin/smtp
 * Partially update SMTP config (verify merged values first).
 */
export async function update(req, res) {
  try {
    const body = req && req.body ? req.body : {};
    const host = body.host;
    const port = body.port;
    const username = body.username;
    const password = body.password;

    const cfg = await SmtpConfig.findOne().sort({ createdAt: -1 });

    if (!cfg) {
      return res
        .status(404)
        .json({ ok: false, code: 404, message: "SMTP not configured" });
    }

    const hasAny =
      host !== undefined ||
      port !== undefined ||
      username !== undefined ||
      password !== undefined;

    if (!hasAny) {
      return res
        .status(400)
        .json({
          ok: false,
          code: 400,
          message:
            "Provide at least one field to update (host/port/username/password)"
        });
    }

    const merged = {
      host: host !== undefined ? host : cfg.host,
      port: port !== undefined ? toNumber(port, cfg.port) : cfg.port,
      username: username !== undefined ? username : cfg.username,
      password: password !== undefined ? password : cfg.password
    };

    await verifySmtp(merged);

    if (host !== undefined) cfg.host = host;
    if (port !== undefined) cfg.port = toNumber(port, cfg.port);
    if (username !== undefined) cfg.username = username;
    if (password !== undefined) cfg.password = password;

    await cfg.save();

    return res.json({ ok: true, smtp: cfg });
  } catch (e) {
    return res
      .status(500)
      .json({
        ok: false,
        code: 500,
        message: (e && e.message) || "Failed to update SMTP configuration"
      });
  }
}

/**
 * DELETE /admin/smtp
 * Delete the current SMTP configuration.
 */
export async function remove(req, res) {
  try {
    const cfg = await SmtpConfig.findOne();

    if (!cfg) {
      return res
        .status(404)
        .json({ ok: false, code: 404, message: "SMTP not configured" });
    }

    await SmtpConfig.deleteOne({ _id: cfg._id });

    return res.json({ ok: true, message: "SMTP configuration deleted" });
  } catch (e) {
    return res
      .status(500)
      .json({
        ok: false,
        code: 500,
        message: (e && e.message) || "Failed to delete SMTP configuration"
      });
  }
}
