"use strict";

/**
 * Public Blog Controller (named exports version)
 * - List / Search / Read / Filter by Category (public endpoints)
 * - Only returns active blogs whose categories are also active
 * - Supports pagination and basic sorting; secondary sort by _id desc
 */

import path from "node:path";
import Blog from "../models/Blog.js";
import BlogCategory from "../models/BlogCategory.js";

/* ------------------------------- utilities ------------------------------- */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function toInt(v, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
// Convert absolute upload path to a public path like "/uploads/..."
function toPublic(absPath) {
  if (!absPath) return absPath;
  const idx = absPath.lastIndexOf(path.sep + "uploads" + path.sep);
  if (idx !== -1) return absPath.slice(idx).replaceAll(path.sep, "/");
  return absPath;
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ================================ controllers ================================ */
/**
 * GET /public/blogs
 * Query: ?page=&pageSize=&sort=(createdAt|updatedAt|title)&order=(asc|desc)
 * Steps: (1) read pagination/sort -> (2) build active filters -> (3) query -> (4) respond
 */
export async function list(req, res) {
  try {
    const q = req && req.query ? req.query : {};
    const page = clamp(toInt(q.page, 1), 1, 1_000_000_000);
    const pageSize = clamp(toInt(q.pageSize, 10), 1, 50);
    const sort = String(q.sort || "createdAt");
    const order = String(q.order || "desc") === "asc" ? 1 : -1;

    const sortObj = {};
    if (["createdAt", "updatedAt", "title"].includes(sort)) sortObj[sort] = order;
    sortObj._id = -1; // secondary sort (stable)

    // Only blogs that are active and belong to active categories
    const activeCatIds = await BlogCategory.find({ isActive: true }).distinct("_id");
    const cond = { isActive: true, categoryId: { $in: activeCatIds } };

    const skip = (page - 1) * pageSize;
    const [itemsRaw, total] = await Promise.all([
      Blog.find(cond).sort(sortObj).skip(skip).limit(pageSize).lean(),
      Blog.countDocuments(cond)
    ]);

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];

    return res.json({
      ok: true,
      data: items.map((b) => ({
        ...b,
        heroImage: toPublic(b.heroImage),
        thumbImage: toPublic(b.thumbImage),
      })),
      meta: { page, pageSize, total }
    });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to list blogs" });
  }
}

/**
 * GET /public/blogs/:slug
 * Steps: (1) find active blog by slug -> (2) ensure category is active -> (3) respond
 */
export async function read(req, res) {
  try {
    const slug = String((req && req.params && req.params.slug) || "").toLowerCase();
    const blog = await Blog.findOne({ slug, isActive: true }).lean();
    if (!blog) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    const cat = await BlogCategory.findById(blog.categoryId).lean();
    if (!cat || !cat.isActive) {
      return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    }

    return res.json({
      ok: true,
      data: {
        ...blog,
        heroImage: toPublic(blog.heroImage),
        thumbImage: toPublic(blog.thumbImage),
      }
    });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to read blog" });
  }
}

/**
 * GET /public/blogs/search?q=keyword&page=&pageSize=
 * Steps: (1) validate q -> (2) build condition with active category filter -> (3) query page -> (4) respond
 */
export async function search(req, res) {
  try {
    const qAll = req && req.query ? req.query : {};
    const q = String(qAll.q || "").trim();
    if (q.length < 2) {
      return res.status(400).json({ ok: false, code: 400, message: "q must be ≥ 2 chars" });
    }

    const page = clamp(toInt(qAll.page, 1), 1, 1_000_000_000);
    const pageSize = clamp(toInt(qAll.pageSize, 10), 1, 50);
    const skip = (page - 1) * pageSize;

    const activeCatIds = await BlogCategory.find({ isActive: true }).distinct("_id");
    const cond = {
      isActive: true,
      categoryId: { $in: activeCatIds },
      $or: [
        { title: { $regex: escapeRegex(q), $options: "i" } },
        { description: { $regex: escapeRegex(q), $options: "i" } }
      ]
    };

    const [itemsRaw, total] = await Promise.all([
      Blog.find(cond).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
      Blog.countDocuments(cond)
    ]);

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];

    return res.json({
      ok: true,
      data: items.map((b) => ({
        ...b,
        heroImage: toPublic(b.heroImage),
        thumbImage: toPublic(b.thumbImage),
      })),
      meta: { page, pageSize, total }
    });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to search blogs" });
  }
}

/**
 * GET /public/blogs/category/:slug
 * Steps: (1) find active category -> (2) fetch its active blogs page -> (3) respond with category meta
 */
export async function byCategory(req, res) {
  try {
    const slug = String((req && req.params && req.params.slug) || "");
    const cat = await BlogCategory.findOne({ slug, isActive: true }).lean();
    if (!cat) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    const q = req && req.query ? req.query : {};
    const page = clamp(toInt(q.page, 1), 1, 1_000_000_000);
    const pageSize = clamp(toInt(q.pageSize, 10), 1, 50);
    const skip = (page - 1) * pageSize;

    const cond = { isActive: true, categoryId: cat._id };
    const [itemsRaw, total] = await Promise.all([
      Blog.find(cond).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
      Blog.countDocuments(cond)
    ]);

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];

    return res.json({
      ok: true,
      data: items.map((b) => ({
        ...b,
        heroImage: toPublic(b.heroImage),
        thumbImage: toPublic(b.thumbImage),
      })),
      meta: {
        page,
        pageSize,
        total,
        category: { _id: cat._id, name: cat.name, slug: cat.slug }
      }
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      code: 500,
      message: (e && e.message) || "Failed to list category blogs"
    });
  }
}

/**
 * GET /public/blog-categories
 * Steps: (1) fetch active categories -> (2) respond
 */
export async function categories(_req, res) {
  try {
    const cats = await BlogCategory.find({ isActive: true })
      .sort({ name: 1, _id: -1 })
      .lean();
    return res.json({ ok: true, data: cats });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to get categories" });
  }
}
