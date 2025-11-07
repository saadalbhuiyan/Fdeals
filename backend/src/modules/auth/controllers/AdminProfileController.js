"use strict";

/* ------------------------------------------------------------------
  Admin Profile controller – SUPER simple version
  Routes:
  GET    /admin/profile/name
  PATCH  /admin/profile/name
  DELETE /admin/profile/name
  GET    /admin/profile/picture
  PATCH  /admin/profile/picture
  DELETE /admin/profile/picture
------------------------------------------------------------------ */

import path from "node:path";
import { assertImageBuffer } from "../../../config/multer.js";
import { saveWebpCover512, deleteLocal } from "../../../utils/image.js";
import Admin from "../models/Admin.js";

// 1 MB size limit for uploaded pictures
const MAX_IMG_SIZE = 1 * 1024 * 1024;

/* ---------- helpers (private) ---------- */

// Return the folder where we save admin pictures
function getAdminUploadFolder() {
  return path.resolve(process.cwd(), "uploads", "admin");
}

// Make sure we have an admin document in the database
async function findOrCreateAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  let admin = await Admin.findOne({ email });
  if (!admin) admin = await Admin.create({ email });
  return admin;
}

// Convert absolute file path → browser-friendly URL
function toPublicUrl(absolutePath) {
  const idx = absolutePath.lastIndexOf(path.sep + "uploads" + path.sep);
  if (idx === -1) return absolutePath; // fallback
  return absolutePath.slice(idx).replaceAll(path.sep, "/");
}

/* ---------- controllers (named exports) ---------- */

/* -------- Name -------- */
export async function getName(req, res) {
  try {
    const admin = await findOrCreateAdmin();
    const name = admin?.name ?? null;
    return res.json({ ok: true, name });
  } catch (err) {
    console.error("Error in getName():", err);
    return res
      .status(500)
      .json({ ok: false, message: err?.message || "Failed to get name" });
  }
}

export async function setName(req, res) {
  try {
    const rawName = req?.body?.name;

    if (typeof rawName !== "string") {
      return res.status(400).json({ ok: false, message: "Name must be text" });
    }

    const name = rawName.trim();

    if (!name || name.length > 50) {
      return res
        .status(400)
        .json({ ok: false, message: "Name: 1-50 characters" });
    }

    const admin = await findOrCreateAdmin();
    admin.name = name;
    await admin.save();

    return res.json({ ok: true, name: admin.name });
  } catch (err) {
    console.error("Error in setName():", err);
    return res
      .status(500)
      .json({ ok: false, message: err?.message || "Failed to set name" });
  }
}

export async function clearName(req, res) {
  try {
    const admin = await findOrCreateAdmin();
    admin.name = null;
    await admin.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error in clearName():", err);
    return res
      .status(500)
      .json({ ok: false, message: err?.message || "Failed to clear name" });
  }
}

/* -------- Picture -------- */
export async function getPicture(req, res) {
  try {
    const admin = await findOrCreateAdmin();
    const picture = admin?.picture ? toPublicUrl(admin.picture) : null;
    return res.json({ ok: true, picture });
  } catch (err) {
    console.error("Error in getPicture():", err);
    return res
      .status(500)
      .json({ ok: false, message: err?.message || "Failed to get picture" });
  }
}

export async function setPicture(req, res) {
  try {
    const fileBuffer = req?.file?.buffer;

    if (!fileBuffer) {
      return res
        .status(400)
        .json({ ok: false, message: "Image missing" });
    }

    await assertImageBuffer(fileBuffer, MAX_IMG_SIZE);

    const admin = await findOrCreateAdmin();

    const folder = path.join(getAdminUploadFolder(), String(admin._id));
    const newPath = await saveWebpCover512(fileBuffer, folder);

    if (admin.picture && admin.picture !== newPath) {
      await deleteLocal(admin.picture);
    }

    admin.picture = newPath;
    await admin.save();

    return res.json({ ok: true, picture: toPublicUrl(newPath) });
  } catch (err) {
    console.error("Error in setPicture():", err);
    const isTooLarge = String(err?.message || "").includes("too large");
    const status = err?.status || (isTooLarge ? 413 : 500);
    return res
      .status(status)
      .json({ ok: false, message: err?.message || "Failed to set picture" });
  }
}

export async function clearPicture(req, res) {
  try {
    const admin = await findOrCreateAdmin();

    if (admin.picture) {
      await deleteLocal(admin.picture);
    }

    admin.picture = null;
    await admin.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error("Error in clearPicture():", err);
    return res
      .status(500)
      .json({ ok: false, message: err?.message || "Failed to clear picture" });
  }
}
