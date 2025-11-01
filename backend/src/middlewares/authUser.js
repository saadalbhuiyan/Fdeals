"use strict";

import { verifyAccessToken } from "../utils/jwt.js";

export function authUser(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, code: 401, message: "Unauthorized" });
    const payload = verifyAccessToken(token);
    if (payload.role !== "user") return res.status(403).json({ ok: false, code: 403, message: "Forbidden" });
    req.auth = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, code: 401, message: "Unauthorized" });
  }
}
