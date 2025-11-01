"use strict";

/**
 * Field-level admin profile controllers:
 * - /admin/profile/name   GET/PATCH/DELETE
 * - /admin/profile/picture GET/PATCH/DELETE
 */

import path from "node:path";
import fs from "node:fs/promises";
import { assertImageBuffer } from "../../../config/multer.js";
import { saveWebpCover512, deleteLocal } from "../../../utils/image.js";
import Admin from "../models/Admin.js";

const MAX_IMG = 1 * 1024 * 1024; // 1MB

function adminUploadsFolder() {
  // server.js ensures 'uploads/admin'
  return path.resolve(process.cwd(), "uploads", "admin");
}

// helpers
async function ensureAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  let a = await Admin.findOne({ email });
  if (!a) a = await Admin.create({ email });
  return a;
}

export default {
  // Name
  async getName(req, res) {
    const a = await ensureAdmin();
    return res.json({ ok: true, name: a.name || null });
  },

  async setName(req, res) {
    const { name } = req.body || {};
    if (typeof name !== "string") return res.status(400).json({ ok: false, code: 400, message: "Invalid input" });
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) {
      return res.status(400).json({ ok: false, code: 400, message: "Name must be 1-50 chars" });
    }
    const a = await ensureAdmin();
    a.name = trimmed;
    await a.save();
    return res.json({ ok: true, name: a.name });
  },

  async clearName(req, res) {
    const a = await ensureAdmin();
    a.name = null;
    await a.save();
    return res.json({ ok: true });
  },

  // Picture
  async getPicture(req, res) {
    const a = await ensureAdmin();
    return res.json({ ok: true, picture: a.picture ? toPublic(a.picture) : null });
  },

  async setPicture(req, res) {
    if (!req.file?.buffer) return res.status(400).json({ ok: false, code: 400, message: "Missing image" });
    // magic-bytes + size
    await assertImageBuffer(req.file.buffer, MAX_IMG);

    const a = await ensureAdmin();

    const folder = path.join(adminUploadsFolder(), String(a._id));
    const newPath = await saveWebpCover512(req.file.buffer, folder);

    // cleanup old
    if (a.picture && a.picture !== newPath) await deleteLocal(a.picture);

    a.picture = newPath;
    await a.save();

    return res.json({ ok: true, picture: toPublic(newPath) });
  },

  async clearPicture(req, res) {
    const a = await ensureAdmin();
    if (a.picture) await deleteLocal(a.picture);
    a.picture = null;
    await a.save();
    return res.json({ ok: true });
  }
};

function toPublic(absPath) {
  const idx = absPath.lastIndexOf(path.sep + "uploads" + path.sep);
  if (idx !== -1) {
    const rel = absPath.slice(idx).replaceAll(path.sep, "/");
    return rel;
  }
  // fallback: return as-is
  return absPath;
}
