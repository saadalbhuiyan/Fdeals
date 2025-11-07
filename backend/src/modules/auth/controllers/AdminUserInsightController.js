"use strict";

/**
 * Admin User Insights Controller
 * ---------------------------------------------------------
 * Routes:
 *   GET /admin/users/count            -> total user count
 *   GET /admin/users?page=&pageSize=  -> paginated list
 * ---------------------------------------------------------
 */

import User from "../models/User.js";

/* ---------------- Small utilities ---------------- */
const MAX_PAGE_SIZE = 50;

// Clamp a number between min and max
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Parse an integer safely with fallback
function toInt(v, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/* ============================ Named Exports ============================ */

/**
 * GET /admin/users/count
 * Step 1: Count total users
 * Step 2: Respond with total
 */
export async function count(req, res) {
  try {
    const total = await User.countDocuments({});
    return res.json({ ok: true, total });
  } catch (e) {
    console.error("Error in count():", e);
    return res.status(500).json({
      ok: false,
      code: 500,
      message: e?.message || "Failed to count users"
    });
  }
}

/**
 * GET /admin/users?page=&pageSize=
 * Step 1: Read & sanitize pagination params
 * Step 2: Fetch users (projection + sort)
 * Step 3: Normalize fields (picture → null)
 * Step 4: Respond with data + meta
 */
export async function list(req, res) {
  try {
    // Step 1: Pagination setup
    const pageRaw = toInt(req.query.page, 1);
    const sizeRaw = toInt(req.query.pageSize, 10);
    const page = clamp(pageRaw || 1, 1, 1_000_000);
    const pageSize = clamp(sizeRaw || 10, 1, MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    // Step 2: Query users and count in parallel
    const [items, total] = await Promise.all([
      User.find({}, { name: 1, email: 1, mobile: 1, address: 1, picture: 1 })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      User.countDocuments({})
    ]);

    // Step 3: Normalize pictures (ensure null instead of undefined)
    const data = items.map(user => ({
      ...user,
      picture: user.picture || null
    }));

    // Step 4: Send response
    return res.json({
      ok: true,
      data,
      meta: { page, pageSize, total }
    });
  } catch (e) {
    console.error("Error in list():", e);
    return res.status(500).json({
      ok: false,
      code: 500,
      message: e?.message || "Failed to list users"
    });
  }
}
