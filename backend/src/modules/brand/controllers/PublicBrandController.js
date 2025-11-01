"use strict";

/**
 * Public Brand Controller
 * - List active brands with valid logo (public-eligible)
 * - Get brand products placeholder: returns 404 if brand not eligible, else empty list (products module not present)
 */

import Brand from "../models/Brand.js";
import path from "node:path";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function toPublic(absPath) {
  const idx = absPath.lastIndexOf(path.sep + "uploads" + path.sep);
  if (idx !== -1) return absPath.slice(idx).replaceAll(path.sep, "/");
  return absPath;
}

export default {
  // GET /public/brands
  async list(req, res) {
    const page = clamp(parseInt(req.query.page || "1"), 1, 1e9);
    const pageSize = clamp(parseInt(req.query.pageSize || "10"), 1, 50);
    const sort = String(req.query.sort || "name");
    const order = String(req.query.order || "asc") === "desc" ? -1 : 1;

    const sortObj = {};
    if (["name", "createdAt", "updatedAt"].includes(sort)) sortObj[sort] = order;
    sortObj._id = -1;

    const cond = { isActive: true, logo: { $ne: null } };
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      Brand.find(cond).collation({ locale: "en", strength: 2 })
        .sort(sortObj).skip(skip).limit(pageSize).lean(),
      Brand.countDocuments(cond)
    ]);

    return res.json({
      ok: true,
      data: items.map(b => ({ ...b, logo: b.logo ? toPublic(b.logo) : null })),
      meta: { page, pageSize, total }
    });
  },

  // GET /public/brands/:slug/products
  async products(req, res) {
    const slug = String(req.params.slug || "").toLowerCase();
    const brand = await Brand.findOne({ slug, isActive: true, logo: { $ne: null } }).lean();
    if (!brand) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    // Products module is out of scope in this project; return empty, keeping contract & 404 rules.
    return res.json({
      ok: true,
      brand: { _id: brand._id, name: brand.name, slug: brand.slug, logo: toPublic(brand.logo) },
      data: [],
      meta: { page: 1, pageSize: 10, total: 0 }
    });
  }
};
