"use strict";

/**
 * Admin Blog Category Controller (named exports version)
 * - Create / List / Read / Update / Delete / Toggle status / Metrics
 * - Slug is immutable (kebab-case), unique with numeric suffix
 * - Delete is blocked if any blog references the category
 */

import slugify from "slugify";
import BlogCategory from "../models/BlogCategory.js";
import Blog from "../models/Blog.js";

/* ------------------------------- utilities ------------------------------- */
// Convert any text to short kebab-case (for slug generation)
function kebab(input) {
  return slugify(String(input || ""), { lower: true, strict: true, trim: true }).substring(0, 100);
}

// Find a unique slug by adding -2, -3, ... if needed
async function uniqueSlug(base) {
  let slug = base || "category";
  let i = 1;
  while (await BlogCategory.exists({ slug })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

// Safe pagination helpers
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function toInt(v, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/* ================================ controllers ================================ */
/**
 * POST /admin/blog-categories
 * Steps: (1) validate -> (2) make unique slug -> (3) create active category -> (4) respond 201
 */
export async function create(req, res) {
  try {
    const body = (req && req.body) ? req.body : {};
    const name = body.name;

    if (typeof name !== "string") {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid name" });
    }

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      return res.status(400).json({ ok: false, code: 400, message: "Name must be 2-60 chars" });
    }

    const base = kebab(trimmed);
    const slug = await uniqueSlug(base);

    const cat = await BlogCategory.create({ name: trimmed, slug, isActive: true });
    return res.status(201).json({ ok: true, data: cat });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to create category" });
  }
}

/**
 * GET /admin/blog-categories
 * Query: ?page=&pageSize=&includeCounts=1
 * Steps: (1) read pagination params -> (2) fetch page + total -> (3) optional blog counts -> (4) respond
 */
export async function list(req, res) {
  try {
    const q = req && req.query ? req.query : {};
    const page = clamp(toInt(q.page, 1), 1, 1_000_000_000);
    const pageSize = clamp(toInt(q.pageSize, 10), 1, 50);
    const includeCounts = String(q.includeCounts || "0") === "1";

    const skip = (page - 1) * pageSize;

    const [itemsRaw, total] = await Promise.all([
      BlogCategory.find({})
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      BlogCategory.countDocuments({})
    ]);

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];

    if (includeCounts && items.length) {
      const ids = items.map((i) => i._id);
      const counts = await Blog.aggregate([
        { $match: { categoryId: { $in: ids } } },
        { $group: { _id: "$categoryId", n: { $sum: 1 } } }
      ]);
      const map = new Map(counts.map((c) => [String(c._id), c.n]));
      items.forEach((i) => {
        i.blogCount = map.get(String(i._id)) || 0;
      });
    }

    return res.json({ ok: true, data: items, meta: { page, pageSize, total } });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to list categories" });
  }
}

/**
 * GET /admin/blog-categories/:id
 * Steps: (1) find by id -> (2) 404 if missing -> (3) respond
 */
export async function read(req, res) {
  try {
    const id = req && req.params ? req.params.id : undefined;
    const cat = await BlogCategory.findById(id);
    if (!cat) {
      return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    }
    return res.json({ ok: true, data: cat });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to read category" });
  }
}

/**
 * PUT /admin/blog-categories/:id
 * Rules: rename only; slug stays the same (immutable)
 * Steps: (1) validate -> (2) update name -> (3) 404 if missing -> (4) respond
 */
export async function update(req, res) {
  try {
    const body = (req && req.body) ? req.body : {};
    const name = body.name;

    if (typeof name !== "string") {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid name" });
    }

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      return res.status(400).json({ ok: false, code: 400, message: "Name must be 2-60 chars" });
    }

    const id = req && req.params ? req.params.id : undefined;
    const cat = await BlogCategory.findByIdAndUpdate(
      id,
      { $set: { name: trimmed } },
      { new: true }
    );

    if (!cat) {
      return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    }
    return res.json({ ok: true, data: cat });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to update category" });
  }
}

/**
 * DELETE /admin/blog-categories/:id
 * Steps: (1) check dependency (blogs use this category) -> (2) 409 if any -> (3) delete -> (4) 404 if missing -> (5) respond
 */
export async function remove(req, res) {
  try {
    const catId = req && req.params ? req.params.id : undefined;

    const dep = await Blog.countDocuments({ categoryId: catId });
    if (dep > 0) {
      return res
        .status(409)
        .json({ ok: false, code: 409, message: "Dependency: category has blogs" });
    }

    const del = await BlogCategory.findByIdAndDelete(catId);
    if (!del) {
      return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to delete category" });
  }
}

/**
 * PATCH /admin/blog-categories/:id/status
 * Steps: (1) validate isActive -> (2) update -> (3) 404 if missing -> (4) respond
 */
export async function toggleStatus(req, res) {
  try {
    const body = (req && req.body) ? req.body : {};
    const isActive = body.isActive;

    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json({ ok: false, code: 400, message: "isActive boolean required" });
    }

    const id = req && req.params ? req.params.id : undefined;
    const cat = await BlogCategory.findByIdAndUpdate(
      id,
      { $set: { isActive } },
      { new: true }
    );

    if (!cat) {
      return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    }
    return res.json({ ok: true, data: cat });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to toggle status" });
  }
}

/**
 * GET /admin/blog-categories/metrics
 * Steps: (1) count total/active/inactive -> (2) respond
 */
export async function metrics(req, res) {
  try {
    const [total, active, inactive] = await Promise.all([
      BlogCategory.countDocuments({}),
      BlogCategory.countDocuments({ isActive: true }),
      BlogCategory.countDocuments({ isActive: false })
    ]);
    return res.json({ ok: true, total, active, inactive });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, code: 500, message: (e && e.message) || "Failed to get metrics" });
  }
}
