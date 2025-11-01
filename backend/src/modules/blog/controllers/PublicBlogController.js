"use strict";

/**
 * Public Blog Controller
 * - List/Search/Read/Filter by Category
 * - Only active blogs with active categories
 * - Secondary sort by _id desc
 */

import Blog from "../models/Blog.js";
import BlogCategory from "../models/BlogCategory.js";
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
  // GET /public/blogs
  async list(req, res) {
    const page = clamp(parseInt(req.query.page || "1"), 1, 1e9);
    const pageSize = clamp(parseInt(req.query.pageSize || "10"), 1, 50);
    const sort = String(req.query.sort || "createdAt");
    const order = String(req.query.order || "desc") === "asc" ? 1 : -1;

    const sortObj = {};
    if (["createdAt", "updatedAt", "title"].includes(sort)) sortObj[sort] = order;
    sortObj._id = -1;

    // Only blogs whose own isActive=true AND category is active
    const activeCatIds = await BlogCategory.find({ isActive: true }).distinct("_id");
    const cond = { isActive: true, categoryId: { $in: activeCatIds } };

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      Blog.find(cond).sort(sortObj).skip(skip).limit(pageSize).lean(),
      Blog.countDocuments(cond)
    ]);
    return res.json({
      ok: true,
      data: items.map(b => ({ ...b, heroImage: toPublic(b.heroImage), thumbImage: toPublic(b.thumbImage) })),
      meta: { page, pageSize, total }
    });
  },

  // GET /public/blogs/:slug
  async read(req, res) {
    const slug = String(req.params.slug || "").toLowerCase();
    const blog = await Blog.findOne({ slug, isActive: true }).lean();
    if (!blog) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    const cat = await BlogCategory.findById(blog.categoryId).lean();
    if (!cat || !cat.isActive) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    return res.json({
      ok: true,
      data: { ...blog, heroImage: toPublic(blog.heroImage), thumbImage: toPublic(blog.thumbImage) }
    });
  },

  // GET /public/blogs?q=keyword&page=&pageSize=
  async search(req, res) {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.status(400).json({ ok: false, code: 400, message: "q must be ≥ 2 chars" });

    const page = clamp(parseInt(req.query.page || "1"), 1, 1e9);
    const pageSize = clamp(parseInt(req.query.pageSize || "10"), 1, 50);
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

    const [items, total] = await Promise.all([
      Blog.find(cond).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
      Blog.countDocuments(cond)
    ]);

    return res.json({
      ok: true,
      data: items.map(b => ({ ...b, heroImage: toPublic(b.heroImage), thumbImage: toPublic(b.thumbImage) })),
      meta: { page, pageSize, total }
    });
  },

  // GET /public/blogs/category/:slug
  async byCategory(req, res) {
    const slug = String(req.params.slug || "");
    const cat = await BlogCategory.findOne({ slug, isActive: true }).lean();
    if (!cat) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    const page = clamp(parseInt(req.query.page || "1"), 1, 1e9);
    const pageSize = clamp(parseInt(req.query.pageSize || "10"), 1, 50);
    const skip = (page - 1) * pageSize;

    const cond = { isActive: true, categoryId: cat._id };
    const [items, total] = await Promise.all([
      Blog.find(cond).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
      Blog.countDocuments(cond)
    ]);

    return res.json({
      ok: true,
      data: items.map(b => ({ ...b, heroImage: toPublic(b.heroImage), thumbImage: toPublic(b.thumbImage) })),
      meta: { page, pageSize, total, category: { _id: cat._id, name: cat.name, slug: cat.slug } }
    });
  },

  // GET /public/blog-categories
  async categories(req, res) {
    const cats = await BlogCategory.find({ isActive: true }).sort({ name: 1, _id: -1 }).lean();
    return res.json({ ok: true, data: cats });
  }
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
