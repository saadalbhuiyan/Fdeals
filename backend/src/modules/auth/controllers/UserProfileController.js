"use strict";

/**
 * Field-level user profile APIs:
 * - /user/profile/name      GET/PATCH/DELETE
 * - /user/profile/picture   GET/PATCH/DELETE
 * - /user/profile/address   GET/PATCH/DELETE
 * - /user/profile/mobile    GET/PATCH/DELETE
 */

import path from "node:path";
import { assertImageBuffer } from "../../../config/multer.js";
import { saveWebpCover512, deleteLocal } from "../../../utils/image.js";
import User from "../models/User.js";

const MAX_IMG = 1 * 1024 * 1024;

function toPublic(absPath) {
  const idx = absPath.lastIndexOf(path.sep + "uploads" + path.sep);
  if (idx !== -1) return absPath.slice(idx).replaceAll(path.sep, "/");
  return absPath;
}

function userUploadsFolderFor(id) {
  return path.resolve(process.cwd(), "uploads", "user", String(id));
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
  async getName(req, res) {
    const user = await User.findById(req.auth.sub);
    return res.json({ ok: true, name: user?.name || null });
  },
  async setName(req, res) {
    const { name } = req.body || {};
    if (typeof name !== "string") return res.status(400).json({ ok: false, code: 400, message: "Invalid input" });
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) {
      return res.status(400).json({ ok: false, code: 400, message: "Name must be 1-50 chars" });
    }
    const user = await User.findByIdAndUpdate(req.auth.sub, { $set: { name: trimmed } }, { new: true });
    return res.json({ ok: true, name: user.name });
  },
  async clearName(req, res) {
    await User.updateOne({ _id: req.auth.sub }, { $set: { name: null } });
    return res.json({ ok: true });
  },

  async getPicture(req, res) {
    const user = await User.findById(req.auth.sub);
    return res.json({ ok: true, picture: user?.picture ? toPublic(user.picture) : null });
  },
  async setPicture(req, res) {
    if (!req.file?.buffer) return res.status(400).json({ ok: false, code: 400, message: "Missing image" });
    await assertImageBuffer(req.file.buffer, MAX_IMG);
    const folder = userUploadsFolderFor(req.auth.sub);
    const newPath = await saveWebpCover512(req.file.buffer, folder);
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ ok: false, code: 404, message: "User not found" });
    if (user.picture && user.picture !== newPath) await deleteLocal(user.picture);
    user.picture = newPath;
    await user.save();
    return res.json({ ok: true, picture: toPublic(newPath) });
  },
  async clearPicture(req, res) {
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ ok: false, code: 404, message: "User not found" });
    if (user.picture) await deleteLocal(user.picture);
    user.picture = null;
    await user.save();
    return res.json({ ok: true });
  },

  async getAddress(req, res) {
    const user = await User.findById(req.auth.sub);
    return res.json({ ok: true, address: user?.address || null });
  },
  async setAddress(req, res) {
    const { address } = req.body || {};
    if (typeof address !== "string") return res.status(400).json({ ok: false, code: 400, message: "Invalid input" });
    const s = address.trim();
    if (s.length > 500) return res.status(400).json({ ok: false, code: 400, message: "Address too long" });
    const user = await User.findByIdAndUpdate(req.auth.sub, { $set: { address: s || null } }, { new: true });
    return res.json({ ok: true, address: user.address });
  },
  async clearAddress(req, res) {
    await User.updateOne({ _id: req.auth.sub }, { $set: { address: null } });
    return res.json({ ok: true });
  },

  async getMobile(req, res) {
    const user = await User.findById(req.auth.sub);
    return res.json({ ok: true, mobile: user?.mobile || null });
  },
  async setMobile(req, res) {
    const { mobile } = req.body || {};
    if (typeof mobile !== "string") return res.status(400).json({ ok: false, code: 400, message: "Invalid input" });
    const norm = normalizeMobile(mobile);
    if (!norm) return res.status(400).json({ ok: false, code: 400, message: "Invalid mobile" });
    const user = await User.findByIdAndUpdate(req.auth.sub, { $set: { mobile: norm } }, { new: true });
    return res.json({ ok: true, mobile: user.mobile });
  },
  async clearMobile(req, res) {
    await User.updateOne({ _id: req.auth.sub }, { $set: { mobile: null } });
    return res.json({ ok: true });
  }
};
