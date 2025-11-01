"use strict";

/**
 * Admin user insights:
 * - GET /admin/users/count
 * - GET /admin/users?page=&pageSize=
 */

import User from "../models/User.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default {
  async count(req, res) {
    const total = await User.countDocuments({});
    return res.json({ ok: true, total });
  },

  async list(req, res) {
    const page = clamp(parseInt(req.query.page || "1"), 1, 1000000);
    const pageSize = clamp(parseInt(req.query.pageSize || "10"), 1, 50);

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      User.find({}, { name: 1, email: 1, mobile: 1, address: 1, picture: 1 })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip).limit(pageSize).lean(),
      User.countDocuments({})
    ]);

    return res.json({
      ok: true,
      data: items.map(it => ({ ...it, picture: it.picture || null })),
      meta: { page, pageSize, total }
    });
  }
};
