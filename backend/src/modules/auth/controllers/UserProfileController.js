"use strict";

/**
 * User Profile (field-level) Controller
 * Routes:
 *   /user/profile/name      GET -> read, PATCH -> set,    DELETE -> clear
 *   /user/profile/picture   GET -> read, PATCH -> upload, DELETE -> clear
 *   /user/profile/address   GET -> read, PATCH -> set,    DELETE -> clear
 *   /user/profile/mobile    GET -> read, PATCH -> set,    DELETE -> clear
 */

import path from "node:path";
import { assertImageBuffer } from "../../../config/multer.js";
import { saveWebpCover512, deleteLocal } from "../../../utils/image.js";
import User from "../models/User.js";

const MAX_IMG = 1 * 1024 * 1024; // 1MB

/* ------------------------------- helpers ------------------------------- */
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

/* ============================ Controller function ============================ */
/* -------- NAME -------- */
export async function getName(req, res) {
  try {
    const user = await User.findById(req.auth.sub);
    const name = user && user.name ? user.name : null;
    return res.json({ ok: true, name });
  } catch (e) {
    const msg = (e && e.message) || "Failed to get name";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}

export async function setName(req, res) {
  try {
    const body = req && req.body ? req.body : {};
    const name = body.name;

    if (typeof name !== "string") {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid input" });
    }

    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) {
      return res.status(400).json({ ok: false, code: 400, message: "Name must be 1-50 chars" });
    }

    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      { $set: { name: trimmed } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ ok: false, code: 404, message: "User not found" });
    }

    return res.json({ ok: true, name: user.name });
  } catch (e) {
    const msg = (e && e.message) || "Failed to set name";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}

export async function clearName(req, res) {
  try {
    await User.updateOne({ _id: req.auth.sub }, { $set: { name: null } });
    return res.json({ ok: true });
  } catch (e) {
    const msg = (e && e.message) || "Failed to clear name";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}

/* -------- PICTURE -------- */
export async function getPicture(req, res) {
  try {
    const user = await User.findById(req.auth.sub);
    const picture = user && user.picture ? toPublic(user.picture) : null;
    return res.json({ ok: true, picture });
  } catch (e) {
    const msg = (e && e.message) || "Failed to get picture";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}

export async function setPicture(req, res) {
  try {
    const fileBuffer =
      req && req.file && req.file.buffer ? req.file.buffer : null;

    if (!fileBuffer) {
      return res.status(400).json({ ok: false, code: 400, message: "Missing image" });
    }

    await assertImageBuffer(fileBuffer, MAX_IMG);

    const user = await User.findById(req.auth.sub);
    if (!user) {
      return res.status(404).json({ ok: false, code: 404, message: "User not found" });
    }

    const folder = userUploadsFolderFor(req.auth.sub);
    const newPath = await saveWebpCover512(fileBuffer, folder);

    if (user.picture && user.picture !== newPath) {
      try {
        await deleteLocal(user.picture);
      } catch (ignore) {}
    }

    user.picture = newPath;
    await user.save();

    return res.json({ ok: true, picture: toPublic(newPath) });
  } catch (e) {
    const msgText = (e && (e.publicMessage || e.message)) || "Failed to set picture";
    const isTooLarge = String((e && e.message) || "").includes("too large");
    const status = (e && e.status) || (isTooLarge ? 413 : 500);
    return res.status(status).json({ ok: false, code: status, message: msgText });
  }
}

export async function clearPicture(req, res) {
  try {
    const user = await User.findById(req.auth.sub);
    if (!user) {
      return res.status(404).json({ ok: false, code: 404, message: "User not found" });
    }

    if (user.picture) {
      try {
        await deleteLocal(user.picture);
      } catch (ignore) {}
    }

    user.picture = null;
    await user.save();

    return res.json({ ok: true });
  } catch (e) {
    const msg = (e && e.message) || "Failed to clear picture";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}

/* -------- ADDRESS -------- */
export async function getAddress(req, res) {
  try {
    const user = await User.findById(req.auth.sub);
    const address = user && user.address ? user.address : null;
    return res.json({ ok: true, address });
  } catch (e) {
    const msg = (e && e.message) || "Failed to get address";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}

export async function setAddress(req, res) {
  try {
    const body = req && req.body ? req.body : {};
    const address = body.address;

    if (typeof address !== "string") {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid input" });
    }

    const s = address.trim();
    if (s.length > 500) {
      return res.status(400).json({ ok: false, code: 400, message: "Address too long" });
    }

    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      { $set: { address: s || null } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ ok: false, code: 404, message: "User not found" });
    }

    return res.json({ ok: true, address: user.address });
  } catch (e) {
    const msg = (e && e.message) || "Failed to set address";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}

export async function clearAddress(req, res) {
  try {
    await User.updateOne({ _id: req.auth.sub }, { $set: { address: null } });
    return res.json({ ok: true });
  } catch (e) {
    const msg = (e && e.message) || "Failed to clear address";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}

/* -------- MOBILE -------- */
export async function getMobile(req, res) {
  try {
    const user = await User.findById(req.auth.sub);
    const mobile = user && user.mobile ? user.mobile : null;
    return res.json({ ok: true, mobile });
  } catch (e) {
    const msg = (e && e.message) || "Failed to get mobile";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}

export async function setMobile(req, res) {
  try {
    const body = req && req.body ? req.body : {};
    const mobile = body.mobile;

    if (typeof mobile !== "string") {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid input" });
    }

    const norm = normalizeMobile(mobile);
    if (!norm) {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid mobile" });
    }

    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      { $set: { mobile: norm } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ ok: false, code: 404, message: "User not found" });
    }

    return res.json({ ok: true, mobile: user.mobile });
  } catch (e) {
    const msg = (e && e.message) || "Failed to set mobile";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}

export async function clearMobile(req, res) {
  try {
    await User.updateOne({ _id: req.auth.sub }, { $set: { mobile: null } });
    return res.json({ ok: true });
  } catch (e) {
    const msg = (e && e.message) || "Failed to clear mobile";
    return res.status(500).json({ ok: false, code: 500, message: msg });
  }
}
