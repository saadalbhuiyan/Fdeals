"use strict";

/**
 * Admin Blog Controller (named exports version)
 * Features:
 *   - Create / List / Read / Update / Delete
 *   - Toggle status
 *   - Search
 *   - Metrics
 *   - Upload inline image
 * Rules:
 *   - HTML is sanitized
 *   - Slug is immutable (kebab-case, unique with numeric suffix)
 *   - Hero (1200x630) & Thumb (400x250) variants are generated
 */

import path from "node:path";
import sanitizeHtml from "sanitize-html";
import slugify from "slugify";
import Blog from "../models/Blog.js";
import BlogCategory from "../models/BlogCategory.js";
import {
  saveBlogHero1200x630,
  saveBlogThumb400x250,
  saveBlogInline800,
  deleteLocal
} from "../../../utils/image.js";
import { assertImageBuffer } from "../../../config/multer.js";

/* --------------------------------- config --------------------------------- */
const MAX_IMG = 2 * 1024 * 1024; // 2MB

/* -------------------------------- utilities -------------------------------- */
// Make short kebab-case string for slug base
function kebab(input) {
  return slugify(String(input || ""), { lower: true, strict: true, trim: true }).substring(0, 140);
}

// Ensure slug uniqueness by adding -2, -3, ...
async function uniqueSlug(base) {
  let slug = base || "post";
  let i = 1;
  while (await Blog.exists({ slug })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function toInt(v, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Convert absolute file path to public path like "/uploads/..."
function toPublic(absPath) {
  if (!absPath) return absPath;
  const idx = absPath.lastIndexOf(path.sep + "uploads" + path.sep);
  if (idx !== -1) return absPath.slice(idx).replaceAll(path.sep, "/");
  return absPath;
}

// Per-blog uploads folder
function blogUploadsFolderFor(id) {
  return path.resolve(process.cwd(), "uploads", "blogs", String(id));
}

// Strict but practical HTML policy for blog content
const HTML_POLICY = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3", "figure", "figcaption"]),
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    "*": ["id", "class"]
  },
  allowedSchemes: ["http", "https", "data", "mailto"],
  disallowedTagsMode: "discard",
  enforceHtmlBoundary: true
};

/* ================================ controllers ================================ */
/**
 * POST /admin/blogs  (multipart: heroImage)
 * Steps: (1) validate inputs -> (2) check category -> (3) check+process image -> (4) sanitize html -> (5) build draft -> (6) save -> (7) respond
 */
export async function create(req, res) {
  try {
    const body = req && req.body ? req.body : {};
    const title = body.title;
    const description = body.description;
    const categoryId = body.categoryId;

    // (1) Validate required fields
    if (!title || !description || !categoryId) {
      return res.status(400).json({
        ok: false, code: 400,
        message: "title, description, categoryId, and heroImage are required"
      });
    }

    // (2) Category must exist and be active
    const cat = await BlogCategory.findById(categoryId);
    if (!cat || !cat.isActive) {
      return res.status(400).json({ ok: false, code: 400, message: "Invalid or inactive category" });
    }

    // (3) Hero image is required and must be a valid image
    const fileBuffer = (req && req.file && req.file.buffer) ? req.file.buffer : null;
    if (!fileBuffer) {
      return res.status(400).json({ ok: false, code: 400, message: "Hero image required (field: heroImage)" });
    }
    await assertImageBuffer(fileBuffer, MAX_IMG);

    // (4) Sanitize HTML description and validate length
    const safeHtml = sanitizeHtml(String(description || ""), HTML_POLICY).trim();
    if (safeHtml.length < 20 || safeHtml.length > 20000) {
      return res.status(400).json({ ok: false, code: 400, message: "Description length invalid" });
    }

    // (5) Prepare immutable unique slug and draft doc (get _id first)
    const base = kebab(title);
    const slug = await uniqueSlug(base);
    const draft = new Blog({
      title: String(title).trim(),
      slug,
      categoryId: cat._id,
      isActive: true
    });

    // Process images into uploads/<blogId>/
    const folder = blogUploadsFolderFor(draft._id);
    const heroAbs = await saveBlogHero1200x630(fileBuffer, folder);
    const thumbAbs = await saveBlogThumb400x250(fileBuffer, folder);

    draft.description = safeHtml;
    draft.heroImage = heroAbs;
    draft.thumbImage = thumbAbs;

    // (6) Save the document
    await draft.save();

    // (7) Respond with created resource
    const payload = draft && draft.toObject ? draft.toObject() : draft;
    return res.status(201).json({ ok: true, data: toClient(payload) });
  } catch (e) {
    const status = (e && e.status) || (String((e && e.message) || "").includes("too large") ? 413 : 500);
    return res.status(status).json({ ok: false, code: status, message: (e && (e.publicMessage || e.message)) || "Failed to create blog" });
  }
}

/**
 * GET /admin/blogs
 * Query: ?page=&pageSize=&sort=(createdAt|updatedAt|title)&order=(asc|desc)
 * Steps: (1) read pagination+sorting -> (2) query -> (3) respond
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
    sortObj._id = -1;

    const skip = (page - 1) * pageSize;
    const [itemsRaw, total] = await Promise.all([
      Blog.find({}).sort(sortObj).skip(skip).limit(pageSize).lean(),
      Blog.countDocuments({})
    ]);

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    return res.json({ ok: true, data: items.map(toClient), meta: { page, pageSize, total } });
  } catch (e) {
    return res.status(500).json({ ok: false, code: 500, message: (e && e.message) || "Failed to list blogs" });
  }
}

/**
 * GET /admin/blogs/:id
 * Steps: (1) find -> (2) 404 if missing -> (3) respond
 */
export async function read(req, res) {
  try {
    const id = req && req.params ? req.params.id : undefined;
    const blog = await Blog.findById(id).lean();
    if (!blog) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    return res.json({ ok: true, data: toClient(blog) });
  } catch (e) {
    return res.status(500).json({ ok: false, code: 500, message: (e && e.message) || "Failed to read blog" });
  }
}

/**
 * PUT /admin/blogs/:id  (title/description/categoryId; optional hero replace)
 * Steps: (1) load -> (2) validate & apply fields -> (3) optional image replace+cleanup -> (4) save -> (5) respond
 */
export async function update(req, res) {
  try {
    const body = req && req.body ? req.body : {};
    const title = body.title;
    const description = body.description;
    const categoryId = body.categoryId;

    const id = req && req.params ? req.params.id : undefined;
    const blog = await Blog.findById(id);
    if (!blog) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    // (2) Title (optional, slug immutable)
    if (typeof title === "string") {
      const trimmed = title.trim();
      if (trimmed.length < 3 || trimmed.length > 120) {
        return res.status(400).json({ ok: false, code: 400, message: "Invalid title length" });
      }
      blog.title = trimmed;
    }

    // Description (optional with sanitize)
    if (typeof description === "string") {
      const safeHtml = sanitizeHtml(description, HTML_POLICY).trim();
      if (safeHtml.length < 20 || safeHtml.length > 20000) {
        return res.status(400).json({ ok: false, code: 400, message: "Description length invalid" });
      }
      blog.description = safeHtml;
    }

    // Category (optional; must exist and be active)
    if (typeof categoryId === "string") {
      const cat = await BlogCategory.findById(categoryId);
      if (!cat || !cat.isActive) {
        return res.status(400).json({ ok: false, code: 400, message: "Invalid or inactive category" });
      }
      blog.categoryId = cat._id;
    }

    // (3) Replace hero/thumbnail if file provided
    const fileBuffer = (req && req.file && req.file.buffer) ? req.file.buffer : null;
    if (fileBuffer) {
      await assertImageBuffer(fileBuffer, MAX_IMG);
      const folder = blogUploadsFolderFor(blog._id);
      const hero = await saveBlogHero1200x630(fileBuffer, folder);
      const thumb = await saveBlogThumb400x250(fileBuffer, folder);

      const oldHero = blog.heroImage;
      const oldThumb = blog.thumbImage;

      blog.heroImage = hero;
      blog.thumbImage = thumb;

      // Best-effort cleanup, ignore failures
      await Promise.all([deleteLocal(oldHero), deleteLocal(oldThumb)]).catch(function () {});
    }

    // (4) Save updates
    await blog.save();

    // (5) Respond
    const payload = blog && blog.toObject ? blog.toObject() : blog;
    return res.json({ ok: true, data: toClient(payload) });
  } catch (e) {
    const status = (e && e.status) || (String((e && e.message) || "").includes("too large") ? 413 : 500);
    return res.status(status).json({ ok: false, code: status, message: (e && (e.publicMessage || e.message)) || "Failed to update blog" });
  }
}

/**
 * DELETE /admin/blogs/:id
 * Steps: (1) load -> (2) delete doc -> (3) delete files (best-effort) -> (4) respond
 */
export async function remove(req, res) {
  try {
    const id = req && req.params ? req.params.id : undefined;
    const b = await Blog.findById(id);
    if (!b) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    const oldHero = b.heroImage;
    const oldThumb = b.thumbImage;

    await Blog.deleteOne({ _id: b._id });
    await Promise.all([deleteLocal(oldHero), deleteLocal(oldThumb)]).catch(function () {});

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, code: 500, message: (e && e.message) || "Failed to delete blog" });
  }
}

/**
 * PATCH /admin/blogs/:id/status
 * Steps: (1) validate -> (2) update -> (3) 404 if missing -> (4) respond
 */
export async function toggleStatus(req, res) {
  try {
    const body = req && req.body ? req.body : {};
    const isActive = body.isActive;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ ok: false, code: 400, message: "isActive boolean required" });
    }

    const id = req && req.params ? req.params.id : undefined;
    const blog = await Blog.findByIdAndUpdate(
      id,
      { $set: { isActive } },
      { new: true }
    ).lean();

    if (!blog) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    return res.json({ ok: true, data: toClient(blog) });
  } catch (e) {
    return res.status(500).json({ ok: false, code: 500, message: (e && e.message) || "Failed to toggle status" });
  }
}

/**
 * GET /admin/blogs/search?q=&page=&pageSize=
 * Steps: (1) build condition -> (2) query page -> (3) respond
 */
export async function search(req, res) {
  try {
    const qAll = req && req.query ? req.query : {};
    const q = String(qAll.q || "").trim();
    const page = clamp(toInt(qAll.page, 1), 1, 1_000_000_000);
    const pageSize = clamp(toInt(qAll.pageSize, 10), 1, 50);
    const skip = (page - 1) * pageSize;

    const cond = q ? { title: { $regex: escapeRegex(q), $options: "i" } } : {};

    const [itemsRaw, total] = await Promise.all([
      Blog.find(cond).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
      Blog.countDocuments(cond)
    ]);

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    return res.json({ ok: true, data: items.map(toClient), meta: { page, pageSize, total } });
  } catch (e) {
    return res.status(500).json({ ok: false, code: 500, message: (e && e.message) || "Failed to search blogs" });
  }
}

/**
 * GET /admin/blogs/metrics
 * Steps: (1) count totals -> (2) group active by category -> (3) respond
 */
export async function metrics(req, res) {
  try {
    const [total, active, inactive] = await Promise.all([
      Blog.countDocuments({}),
      Blog.countDocuments({ isActive: true }),
      Blog.countDocuments({ isActive: false })
    ]);

    const activeByCategory = await Blog.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$categoryId", n: { $sum: 1 } } }
    ]);

    return res.json({ ok: true, total, active, inactive, activeByCategory });
  } catch (e) {
    return res.status(500).json({ ok: false, code: 500, message: (e && e.message) || "Failed to get metrics" });
  }
}

/**
 * POST /admin/blogs/:id/images  (inline image upload)
 * Steps: (1) validate image -> (2) load blog -> (3) save inline img -> (4) respond with URL
 */
export async function uploadInlineImage(req, res) {
  try {
    const fileBuffer = (req && req.file && req.file.buffer) ? req.file.buffer : null;
    if (!fileBuffer) {
      return res.status(400).json({ ok: false, code: 400, message: "Missing image" });
    }
    await assertImageBuffer(fileBuffer, MAX_IMG);

    const id = req && req.params ? req.params.id : undefined;
    const b = await Blog.findById(id);
    if (!b) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    const folder = blogUploadsFolderFor(b._id);
    const p = await saveBlogInline800(fileBuffer, folder);

    return res.status(201).json({ ok: true, url: toPublic(p) });
  } catch (e) {
    const status = (e && e.status) || (String((e && e.message) || "").includes("too large") ? 413 : 500);
    return res.status(status).json({ ok: false, code: status, message: (e && (e.publicMessage || e.message)) || "Failed to upload image" });
  }
}

/* --------------------------------- helpers -------------------------------- */
function toClient(b) {
  const obj = b && b.toObject ? b.toObject() : b; // normalize
  return {
    ...obj,
    heroImage: toPublic(obj.heroImage),
    thumbImage: toPublic(obj.thumbImage)
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
