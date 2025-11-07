"use strict";

/**
 * Admin Brand Controller (beginner-friendly)
 * Features:
 *   - Create / List / Read / Update (name/logo) / Delete
 *   - Toggle status
 *   - Search
 *   - Metrics
 * Rules:
 *   - Name is case-insensitive unique (2–60 chars)
 *   - Slug is immutable (kebab-case, unique with numeric suffix)
 *   - Logo is optional on create; required only for public eligibility
 *   - Logo processing: 300x300 contain → WEBP
 */

import path from "node:path";
import slugify from "slugify";
import Brand from "../models/Brand.js";
import { assertImageBuffer } from "../../../config/multer.js";
import { saveWebpContain300, deleteLocal } from "../../../utils/image.js";

/* --------------------------------- config --------------------------------- */
const MAX_IMG = 2 * 1024 * 1024; // 2MB

/* -------------------------------- utilities -------------------------------- */
// Short kebab-case string for slug base
function kebab(input) {
  return slugify(String(input || ""), { lower: true, strict: true, trim: true }).slice(0, 80);
}

// Ensure slug uniqueness by adding -2, -3, ...
async function uniqueSlug(base) {
  let slug = base || "brand";
  let i = 1;
  while (await Brand.exists({ slug })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

// Pagination helpers
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function toInt(v, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Convert absolute path to public "/uploads/..." style path
function toPublic(absPath) {
  if (!absPath) return absPath;
  const idx = absPath.lastIndexOf(path.sep + "uploads" + path.sep);
  if (idx !== -1) return absPath.slice(idx).replaceAll(path.sep, "/");
  return absPath;
}

// Per-brand upload folder
function brandUploadsFolderFor(id) {
  return path.resolve(process.cwd(), "uploads", "brands", String(id));
}

// Safe regex for search
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalize mongoose doc/plain object and map logo path to public
function toClient(b) {
  const obj = b?.toObject ? b.toObject() : b;
  return { ...obj, logo: obj.logo ? toPublic(obj.logo) : null };
}

/* ================================ controller ================================ */
export default {
  /**
   * POST /admin/brands  (multipart optional: logo)
   * Steps: (1) validate name -> (2) enforce CI-unique -> (3) build slug -> (4) create row -> (5) optional logo process -> (6) respond 201
   */
  async create(req, res) {
    try {
      const { name } = req.body || {};
      if (typeof name !== "string") {
        return res.status(400).json({ ok: false, code: 400, message: "Invalid name" });
      }

      const trimmed = name.trim();
      if (trimmed.length < 2 || trimmed.length > 60) {
        return res.status(400).json({ ok: false, code: 400, message: "Name must be 2-60 chars" });
      }

      // CI-unique name
      const exists = await Brand.exists({ name: new RegExp(`^${escapeRegex(trimmed)}$`, "i") });
      if (exists) {
        return res.status(409).json({ ok: false, code: 409, message: "Brand name already exists" });
      }

      // Immutable unique slug
      const base = kebab(trimmed.normalize("NFKD"));
      const slug = await uniqueSlug(base);

      // Create initial brand
      const brand = await Brand.create({ name: trimmed, slug, isActive: true, logo: null });

      // Optional logo
      if (req.file?.buffer) {
        await assertImageBuffer(req.file.buffer, MAX_IMG);
        const folder = brandUploadsFolderFor(brand._id);
        const logoPath = await saveWebpContain300(req.file.buffer, folder);
        brand.logo = logoPath;
        await brand.save();
      }

      return res.status(201).json({ ok: true, data: toClient(brand) });
    } catch (e) {
      const status = e?.status || (String(e?.message || "").includes("too large") ? 413 : 500);
      return res.status(status).json({ ok: false, code: status, message: e?.publicMessage || e?.message || "Failed to create brand" });
    }
  },

  /**
   * GET /admin/brands
   * Query: ?page=&pageSize=&sort=(name|createdAt|updatedAt)&order=(asc|desc)
   * Steps: (1) read pagination/sort -> (2) query + count -> (3) map to client -> (4) respond
   */
  async list(req, res) {
    try {
      const page = clamp(toInt(req.query.page, 1), 1, 1_000_000_000);
      const pageSize = clamp(toInt(req.query.pageSize, 10), 1, 50);
      const sort = String(req.query.sort || "name");
      const order = String(req.query.order || "asc") === "desc" ? -1 : 1;

      const sortObj = {};
      if (["name", "createdAt", "updatedAt"].includes(sort)) sortObj[sort] = order;
      sortObj._id = -1;

      const skip = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        Brand.find({})
          .collation({ locale: "en", strength: 2 }) // case-insensitive sort
          .sort(sortObj)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        Brand.countDocuments({})
      ]);

      return res.json({ ok: true, data: items.map(toClient), meta: { page, pageSize, total } });
    } catch (e) {
      return res.status(500).json({ ok: false, code: 500, message: e?.message || "Failed to list brands" });
    }
  },

  /**
   * GET /admin/brands/:id
   * Steps: (1) find -> (2) 404 if missing -> (3) respond
   */
  async read(req, res) {
    try {
      const b = await Brand.findById(req.params.id).lean();
      if (!b) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
      return res.json({ ok: true, data: toClient(b) });
    } catch (e) {
      return res.status(500).json({ ok: false, code: 500, message: e?.message || "Failed to read brand" });
    }
  },

  /**
   * PATCH /admin/brands/:id
   * Body options:
   *   - JSON only: { name } and/or { logo: null } (remove)
   *   - Multipart: file field replaces logo
   * Steps: (1) load -> (2) apply JSON updates -> (3) optional logo replace/remove -> (4) save -> (5) respond
   */
  async update(req, res) {
    try {
      const id = req.params.id;
      const brand = await Brand.findById(id);
      if (!brand) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

      const hasJson = typeof req.body === "object" && !req.file;

      // Rename (CI-unique excluding self)
      if (hasJson && Object.prototype.hasOwnProperty.call(req.body, "name")) {
        const name = String(req.body.name || "").trim();
        if (!name || name.length < 2 || name.length > 60) {
          return res.status(400).json({ ok: false, code: 400, message: "Name must be 2-60 chars" });
        }
        const dup = await Brand.exists({
          _id: { $ne: brand._id },
          name: new RegExp(`^${escapeRegex(name)}$`, "i")
        });
        if (dup) return res.status(409).json({ ok: false, code: 409, message: "DUPLICATE_NAME" });
        brand.name = name;
      }

      // Remove logo if explicitly {"logo": null}
      if (hasJson && Object.prototype.hasOwnProperty.call(req.body, "logo") && req.body.logo === null) {
        if (brand.logo) {
          try { await deleteLocal(brand.logo); } catch { /* ignore */ }
        }
        brand.logo = null;
      }

      // Replace logo via multipart
      if (req.file?.buffer) {
        await assertImageBuffer(req.file.buffer, MAX_IMG);
        const folder = brandUploadsFolderFor(brand._id);
        const newPath = await saveWebpContain300(req.file.buffer, folder);
        const old = brand.logo;
        brand.logo = newPath;
        if (old && old !== newPath) {
          try { await deleteLocal(old); } catch { /* ignore */ }
        }
      }

      await brand.save();
      return res.json({ ok: true, data: toClient(brand) });
    } catch (e) {
      const status = e?.status || (String(e?.message || "").includes("too large") ? 413 : 500);
      return res.status(status).json({ ok: false, code: status, message: e?.publicMessage || e?.message || "Failed to update brand" });
    }
  },

  /**
   * DELETE /admin/brands/:id
   * Steps: (1) load -> (2) delete doc -> (3) delete file best-effort -> (4) respond
   * Note: Dependency checks with products can be added later (return 409)
   */
  async remove(req, res) {
    try {
      const brand = await Brand.findById(req.params.id);
      if (!brand) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

      const old = brand.logo;
      await Brand.deleteOne({ _id: brand._id });
      if (old) {
        try { await deleteLocal(old); } catch { /* ignore */ }
      }

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, code: 500, message: e?.message || "Failed to delete brand" });
    }
  },

  /**
   * PATCH /admin/brands/:id/status  { isActive: boolean }
   * Steps: (1) validate -> (2) update -> (3) 404 if missing -> (4) respond
   */
  async toggleStatus(req, res) {
    try {
      const { isActive } = req.body || {};
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ ok: false, code: 400, message: "isActive boolean required" });
      }
      const b = await Brand.findByIdAndUpdate(req.params.id, { $set: { isActive } }, { new: true });
      if (!b) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
      return res.json({ ok: true, data: toClient(b) });
    } catch (e) {
      return res.status(500).json({ ok: false, code: 500, message: e?.message || "Failed to toggle status" });
    }
  },

  /**
   * GET /admin/brands/search?q=&page=&pageSize=&sort=&order=
   * Steps: (1) validate q -> (2) build cond -> (3) query page -> (4) respond
   */
  async search(req, res) {
    try {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) {
        return res.status(400).json({ ok: false, code: 400, message: "q must be ≥ 2 chars" });
      }

      const page = clamp(toInt(req.query.page, 1), 1, 1_000_000_000);
      const pageSize = clamp(toInt(req.query.pageSize, 10), 1, 50);
      const sort = String(req.query.sort || "name");
      const order = String(req.query.order || "asc") === "desc" ? -1 : 1;

      const sortObj = {};
      if (["name", "createdAt", "updatedAt"].includes(sort)) sortObj[sort] = order;
      sortObj._id = -1;

      const skip = (page - 1) * pageSize;

      const cond = {
        $or: [
          { name: { $regex: escapeRegex(q), $options: "i" } },
          { slug: { $regex: escapeRegex(q), $options: "i" } }
        ]
      };

      const [items, total] = await Promise.all([
        Brand.find(cond)
          .collation({ locale: "en", strength: 2 })
          .sort(sortObj)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        Brand.countDocuments(cond)
      ]);

      return res.json({ ok: true, data: items.map(toClient), meta: { page, pageSize, total } });
    } catch (e) {
      return res.status(500).json({ ok: false, code: 500, message: e?.message || "Failed to search brands" });
    }
  },

  /**
   * GET /admin/brands/metrics
   * Steps: (1) count total/active/inactive -> (2) respond
   */
  async metrics(_req, res) {
    try {
      const [total, active, inactive] = await Promise.all([
        Brand.countDocuments({}),
        Brand.countDocuments({ isActive: true }),
        Brand.countDocuments({ isActive: false })
      ]);
      return res.json({ ok: true, total, active, inactive });
    } catch (e) {
      return res.status(500).json({ ok: false, code: 500, message: e?.message || "Failed to get metrics" });
    }
  }
};
