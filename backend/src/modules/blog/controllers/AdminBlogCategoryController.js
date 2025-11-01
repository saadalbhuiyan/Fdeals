"use strict";

/**
 * Admin Blog Category Controller
 * - Create/List/Read/Update/Delete/Toggle/Metrics
 * - Immutable slug (kebab-case), unique with numeric suffix
 * - Delete blocked if any blog references the category
 */

import slugify from "slugify";
import BlogCategory from "../models/BlogCategory.js";
import Blog from "../models/Blog.js";

function kebab(input) {
  return slugify(String(input || ""), {
    lower: true,
    strict: true,
    trim: true
  }).substring(0, 100);
}

async function uniqueSlug(base) {
  let slug = base || "category";
  let i = 1;
  // Try without suffix first
  while (await BlogCategory.exists({ slug })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default {
  // POST /admin/blog-categories
  async create(req, res) {
    const { name } = req.body || {};
    if (typeof name !== "string") return res.status(400).json({ ok: false, code: 400, message: "Invalid name" });
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      return res.status(400).json({ ok: false, code: 400, message: "Name must be 2-60 chars" });
    }

    const base = kebab(trimmed);
    const slug = await uniqueSlug(base);

    const cat = await BlogCategory.create({ name: trimmed, slug, isActive: true });
    return res.status(201).json({ ok: true, data: cat });
  },

  // GET /admin/blog-categories
  async list(req, res) {
    const page = clamp(parseInt(req.query.page || "1"), 1, 1e9);
    const pageSize = clamp(parseInt(req.query.pageSize || "10"), 1, 50);
    const includeCounts = String(req.query.includeCounts || "0") === "1";

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      BlogCategory.find({})
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip).limit(pageSize).lean(),
      BlogCategory.countDocuments({})
    ]);

    if (includeCounts && items.length) {
      const ids = items.map(i => i._id);
      const counts = await Blog.aggregate([
        { $match: { categoryId: { $in: ids } } },
        { $group: { _id: "$categoryId", n: { $sum: 1 } } }
      ]);
      const map = new Map(counts.map(c => [String(c._id), c.n]));
      items.forEach(i => { i.blogCount = map.get(String(i._id)) || 0; });
    }

    return res.json({ ok: true, data: items, meta: { page, pageSize, total } });
  },

  // GET /admin/blog-categories/:id
  async read(req, res) {
    const cat = await BlogCategory.findById(req.params.id);
    if (!cat) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    return res.json({ ok: true, data: cat });
  },

  // PUT /admin/blog-categories/:id  (rename only; slug unchanged)
  async update(req, res) {
    const { name } = req.body || {};
    if (typeof name !== "string") return res.status(400).json({ ok: false, code: 400, message: "Invalid name" });
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      return res.status(400).json({ ok: false, code: 400, message: "Name must be 2-60 chars" });
    }
    const cat = await BlogCategory.findByIdAndUpdate(req.params.id, { $set: { name: trimmed } }, { new: true });
    if (!cat) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    return res.json({ ok: true, data: cat });
  },

  // DELETE /admin/blog-categories/:id
  async remove(req, res) {
    const catId = req.params.id;
    const dep = await Blog.countDocuments({ categoryId: catId });
    if (dep > 0) return res.status(409).json({ ok: false, code: 409, message: "Dependency: category has blogs" });
    const del = await BlogCategory.findByIdAndDelete(catId);
    if (!del) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    return res.json({ ok: true });
  },

  // PATCH /admin/blog-categories/:id/status
  async toggleStatus(req, res) {
    const { isActive } = req.body || {};
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ ok: false, code: 400, message: "isActive boolean required" });
    }
    const cat = await BlogCategory.findByIdAndUpdate(req.params.id, { $set: { isActive } }, { new: true });
    if (!cat) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    return res.json({ ok: true, data: cat });
  },

  // GET /admin/blog-categories/metrics
  async metrics(req, res) {
    const [total, active, inactive] = await Promise.all([
      BlogCategory.countDocuments({}),
      BlogCategory.countDocuments({ isActive: true }),
      BlogCategory.countDocuments({ isActive: false })
    ]);
    return res.json({ ok: true, total, active, inactive });
  }
};
