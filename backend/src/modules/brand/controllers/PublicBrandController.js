"use strict";

/**
 * Public Brand Controller (beginner-friendly)
 * What it does:
 *   - List active brands that have a logo (public-eligible)
 *   - Products endpoint placeholder (returns 404 if brand not eligible, else empty list)
 */

import path from "node:path";
import Brand from "../models/Brand.js";

/* ------------------------------- utilities ------------------------------- */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function toInt(v, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
// Convert absolute upload path to public "/uploads/..." path
function toPublic(absPath) {
  if (!absPath) return absPath;
  const idx = absPath.lastIndexOf(path.sep + "uploads" + path.sep);
  if (idx !== -1) return absPath.slice(idx).replaceAll(path.sep, "/");
  return absPath;
}

/* ================================ controller ================================ */
export default {
  /**
   * GET /public/brands
   * Steps: (1) read pagination/sort -> (2) build condition (active + has logo) -> (3) query + count -> (4) map logo to public path -> (5) respond
   */
  async list(req, res) {
    try {
      const page = clamp(toInt(req.query.page, 1), 1, 1_000_000_000);
      const pageSize = clamp(toInt(req.query.pageSize, 10), 1, 50);
      const sort = String(req.query.sort || "name");
      const order = String(req.query.order || "asc") === "desc" ? -1 : 1;

      const sortObj = {};
      if (["name", "createdAt", "updatedAt"].includes(sort)) sortObj[sort] = order;
      sortObj._id = -1; // stable secondary sort

      const cond = { isActive: true, logo: { $ne: null } };
      const skip = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        Brand.find(cond)
          .collation({ locale: "en", strength: 2 }) // case-insensitive sort by "name"
          .sort(sortObj)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        Brand.countDocuments(cond)
      ]);

      return res.json({
        ok: true,
        data: items.map(b => ({ ...b, logo: b.logo ? toPublic(b.logo) : null })),
        meta: { page, pageSize, total }
      });
    } catch (e) {
      return res.status(500).json({ ok: false, code: 500, message: e?.message || "Failed to list brands" });
    }
  },

  /**
   * GET /public/brands/:slug/products
   * Steps: (1) find eligible brand (active + has logo) -> (2) 404 if missing -> (3) return empty product list (module not implemented)
   */
  async products(req, res) {
    try {
      const slug = String(req.params.slug || "").toLowerCase();

      const brand = await Brand.findOne({
        slug,
        isActive: true,
        logo: { $ne: null }
      }).lean();

      if (!brand) {
        return res.status(404).json({ ok: false, code: 404, message: "Not found" });
      }

      // Products module is out of scope in this project; keep contract and return empty list.
      return res.json({
        ok: true,
        brand: {
          _id: brand._id,
          name: brand.name,
          slug: brand.slug,
          logo: toPublic(brand.logo)
        },
        data: [],
        meta: { page: 1, pageSize: 10, total: 0 }
      });
    } catch (e) {
      return res.status(500).json({ ok: false, code: 500, message: e?.message || "Failed to fetch brand products" });
    }
  }
};
