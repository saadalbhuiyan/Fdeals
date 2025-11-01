"use strict";

/**
 * Admin Blog Controller
 * - Create/List/Read/Update/Delete
 * - Toggle status
 * - Search
 * - Metrics
 * - Upload inline image
 * - Sanitized HTML, immutable slug, hero & thumb variants, dependency checks
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

const MAX_IMG = 2 * 1024 * 1024;

function kebab(input) {
  return slugify(String(input || ""), {
    lower: true,
    strict: true,
    trim: true
  }).substring(0, 140);
}
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
function toPublic(absPath) {
  if (!absPath) return absPath;
  const idx = absPath.lastIndexOf(path.sep + "uploads" + path.sep);
  if (idx !== -1) return absPath.slice(idx).replaceAll(path.sep, "/");
  return absPath;
}
function blogUploadsFolderFor(id) {
  return path.resolve(process.cwd(), "uploads", "blogs", String(id));
}
const HTML_POLICY = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "img", "h1", "h2", "h3", "figure", "figcaption"
  ]),
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    "*": ["id", "class"]
  },
  allowedSchemes: ["http", "https", "data", "mailto"],
  allowedSchemesByTag: {},
  disallowedTagsMode: "discard",
  enforceHtmlBoundary: true
};

export default {
  // POST /admin/blogs  (multipart: heroImage)
  async create(req, res) {
    const { title, description, categoryId } = req.body || {};

    // Basic input checks
    if (!title || !description || !categoryId) {
      return res.status(400).json({
        ok: false, code: 400,
        message: "title, description, categoryId এবং heroImage দরকার"
      });
    }

    // Category must exist + be active
    const cat = await BlogCategory.findById(categoryId);
    if (!cat || !cat.isActive) {
      return res.status(400).json({
        ok: false, code: 400,
        message: "Invalid/inactive category"
      });
    }

    // Image required (route-এ অবশ্যই upload.single('heroImage'))
    if (!req.file?.buffer) {
      return res.status(400).json({
        ok: false, code: 400, message: "Hero image required (key: heroImage)"
      });
    }
    await assertImageBuffer(req.file.buffer, MAX_IMG);

    // Slug (immutable)
    const base = kebab(title);
    const slug = await uniqueSlug(base);

    // Sanitize HTML
    const safeHtml = sanitizeHtml(String(description || ""), HTML_POLICY).trim();
    if (safeHtml.length < 20 || safeHtml.length > 20000) {
      return res.status(400).json({
        ok: false, code: 400, message: "Description length invalid"
      });
    }

    // ✅ বাগ ফিক্স: আগে save নয় — _id পেতে new Blog(), তারপর ইমেজ প্রসেস, তারপর save()
    const draft = new Blog({
      title: String(title).trim(),
      slug,
      categoryId: cat._id,
      isActive: true
      // description/heroImage/thumbImage পরে সেট করা হবে
    });

    // uploads/<blogId> ফোল্ডারে ফাইল প্রসেস
    const folder = blogUploadsFolderFor(draft._id);
    const heroAbs = await saveBlogHero1200x630(req.file.buffer, folder);
    const thumbAbs = await saveBlogThumb400x250(req.file.buffer, folder);

    // সব ফিল্ড সেট করে তারপর save
    draft.description = safeHtml;
    draft.heroImage = heroAbs;
    draft.thumbImage = thumbAbs;

    await draft.save();

    return res.status(201).json({ ok: true, data: toClient(draft.toObject ? draft.toObject() : draft) });
  },

  // GET /admin/blogs
  async list(req, res) {
    const page = clamp(parseInt(req.query.page || "1"), 1, 1e9);
    const pageSize = clamp(parseInt(req.query.pageSize || "10"), 1, 50);
    const sort = String(req.query.sort || "createdAt");
    const order = String(req.query.order || "desc") === "asc" ? 1 : -1;

    const sortObj = {};
    if (["createdAt", "updatedAt", "title"].includes(sort)) sortObj[sort] = order;
    sortObj._id = -1;

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      Blog.find({}).sort(sortObj).skip(skip).limit(pageSize).lean(),
      Blog.countDocuments({})
    ]);

    return res.json({
      ok: true,
      data: items.map(toClient),
      meta: { page, pageSize, total }
    });
  },

  // GET /admin/blogs/:id
  async read(req, res) {
    const blog = await Blog.findById(req.params.id).lean();
    if (!blog) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    return res.json({ ok: true, data: toClient(blog) });
  },

  // PUT /admin/blogs/:id  (fields; hero replace optional)
  async update(req, res) {
    const { title, description, categoryId } = req.body || {};
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    // title optional; slug immutable
    if (typeof title === "string") {
      const trimmed = title.trim();
      if (trimmed.length < 3 || trimmed.length > 120) {
        return res.status(400).json({ ok: false, code: 400, message: "Invalid title length" });
      }
      blog.title = trimmed;
    }

    if (typeof description === "string") {
      const safeHtml = sanitizeHtml(description, HTML_POLICY).trim();
      if (safeHtml.length < 20 || safeHtml.length > 20000) {
        return res.status(400).json({ ok: false, code: 400, message: "Description length invalid" });
      }
      blog.description = safeHtml;
    }

    if (typeof categoryId === "string") {
      const cat = await BlogCategory.findById(categoryId);
      if (!cat || !cat.isActive) {
        return res.status(400).json({ ok: false, code: 400, message: "Invalid/inactive category" });
      }
      blog.categoryId = cat._id;
    }

    // hero replace if file provided
    if (req.file?.buffer) {
      await assertImageBuffer(req.file.buffer, MAX_IMG);
      const folder = blogUploadsFolderFor(blog._id);
      const hero = await saveBlogHero1200x630(req.file.buffer, folder);
      const thumb = await saveBlogThumb400x250(req.file.buffer, folder);
      const oldHero = blog.heroImage;
      const oldThumb = blog.thumbImage;
      blog.heroImage = hero;
      blog.thumbImage = thumb;
      await Promise.all([deleteLocal(oldHero), deleteLocal(oldThumb)]).catch(() => {});
    }

    await blog.save();
    return res.json({ ok: true, data: toClient(blog.toObject ? blog.toObject() : blog) });
  },

  // DELETE /admin/blogs/:id
  async remove(req, res) {
    const b = await Blog.findById(req.params.id);
    if (!b) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    const oldHero = b.heroImage;
    const oldThumb = b.thumbImage;
    await Blog.deleteOne({ _id: b._id });
    await Promise.all([deleteLocal(oldHero), deleteLocal(oldThumb)]).catch(() => {});
    return res.json({ ok: true });
  },

  // PATCH /admin/blogs/:id/status
  async toggleStatus(req, res) {
    const { isActive } = req.body || {};
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ ok: false, code: 400, message: "isActive boolean required" });
    }
    const blog = await Blog.findByIdAndUpdate(req.params.id, { $set: { isActive } }, { new: true }).lean();
    if (!blog) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    return res.json({ ok: true, data: toClient(blog) });
  },

  // GET /admin/blogs/search?q=&page=&pageSize=
  async search(req, res) {
    const q = String(req.query.q || "").trim();
    const page = clamp(parseInt(req.query.page || "1"), 1, 1e9);
    const pageSize = clamp(parseInt(req.query.pageSize || "10"), 1, 50);
    const skip = (page - 1) * pageSize;

    const cond = q ? { title: { $regex: escapeRegex(q), $options: "i" } } : {};
    const [items, total] = await Promise.all([
      Blog.find(cond).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
      Blog.countDocuments(cond)
    ]);

    return res.json({ ok: true, data: items.map(toClient), meta: { page, pageSize, total } });
  },

  // GET /admin/blogs/metrics
  async metrics(req, res) {
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
  },

  // POST /admin/blogs/:id/images  (inline image upload, returns URL)
  async uploadInlineImage(req, res) {
    if (!req.file?.buffer) return res.status(400).json({ ok: false, code: 400, message: "Missing image" });
    await assertImageBuffer(req.file.buffer, MAX_IMG);
    const b = await Blog.findById(req.params.id);
    if (!b) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    const folder = blogUploadsFolderFor(b._id);
    const p = await saveBlogInline800(req.file.buffer, folder);
    return res.status(201).json({ ok: true, url: toPublic(p) });
  }
};

function toClient(b) {
  // b can be plain object or mongoose doc; normalize
  const obj = b?.toObject ? b.toObject() : b;
  return {
    ...obj,
    heroImage: toPublic(obj.heroImage),
    thumbImage: toPublic(obj.thumbImage)
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
