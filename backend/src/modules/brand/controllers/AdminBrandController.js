"use strict";

/**
 * Admin Brand Controller
 * - Create/List/Read/Update/Delete/Toggle/Search/Metrics
 * - Name CI-unique (2–60 chars), immutable slug (kebab-case with numeric suffix)
 * - Logo optional on create; required for public eligibility
 * - Logo processing: 300x300 contain → WEBP(q≈88)
 */

import path from "node:path";
import slugify from "slugify";
import Brand from "../models/Brand.js";
import { assertImageBuffer } from "../../../config/multer.js";
import { saveWebpContain300, deleteLocal } from "../../../utils/image.js";

const MAX_IMG = 2 * 1024 * 1024; // 2 MiB

function kebab(input) {
  return slugify(String(input || ""), { lower: true, strict: true, trim: true }).slice(0, 80);
}
async function uniqueSlug(base) {
  let slug = base || "brand";
  let i = 1;
  while (await Brand.exists({ slug })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function toPublic(absPath) {
  const idx = absPath.lastIndexOf(path.sep + "uploads" + path.sep);
  if (idx !== -1) return absPath.slice(idx).replaceAll(path.sep, "/");
  return absPath;
}
function brandUploadsFolderFor(id) {
  return path.resolve(process.cwd(), "uploads", "brands", String(id));
}

export default {
  // POST /admin/brands  (multipart optional: logo)
  async create(req, res) {
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

    // slug (immutable)
    const base = kebab(trimmed.normalize("NFKD"));
    const slug = await uniqueSlug(base);

    // Create initial row
    const brand = await Brand.create({ name: trimmed, slug, isActive: true, logo: null });

    // optional logo
    if (req.file?.buffer) {
      await assertImageBuffer(req.file.buffer, MAX_IMG);
      const folder = brandUploadsFolderFor(brand._id);
      const logoPath = await saveWebpContain300(req.file.buffer, folder);
      brand.logo = logoPath;
      await brand.save();
    }

    return res.status(201).json({ ok: true, data: toClient(brand) });
  },

  // GET /admin/brands
  async list(req, res) {
    const page = clamp(parseInt(req.query.page || "1"), 1, 1e9);
    const pageSize = clamp(parseInt(req.query.pageSize || "10"), 1, 50);
    const sort = String(req.query.sort || "name");
    const order = String(req.query.order || "asc") === "desc" ? -1 : 1;

    const sortObj = {};
    if (["name", "createdAt", "updatedAt"].includes(sort)) sortObj[sort] = order;
    sortObj._id = -1;

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      Brand.find({}).collation({ locale: "en", strength: 2 })
        .sort(sortObj).skip(skip).limit(pageSize).lean(),
      Brand.countDocuments({})
    ]);

    return res.json({
      ok: true,
      data: items.map(toClient),
      meta: { page, pageSize, total }
    });
  },

  // GET /admin/brands/:id
  async read(req, res) {
    const b = await Brand.findById(req.params.id).lean();
    if (!b) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    return res.json({ ok: true, data: toClient(b) });
  },

  // PATCH /admin/brands/:id  (partial update: {name} or logo upload/remove)
  async update(req, res) {
    const id = req.params.id;
    const brand = await Brand.findById(id);
    if (!brand) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    const hasJson = typeof req.body === "object" && !req.file;
    if (hasJson && Object.prototype.hasOwnProperty.call(req.body, "name")) {
      const name = String(req.body.name || "").trim();
      if (!name || name.length < 2 || name.length > 60) {
        return res.status(400).json({ ok: false, code: 400, message: "Name must be 2-60 chars" });
      }
      // CI-unique excluding self
      const dup = await Brand.exists({
        _id: { $ne: brand._id },
        name: new RegExp(`^${escapeRegex(name)}$`, "i")
      });
      if (dup) return res.status(409).json({ ok: false, code: 409, message: "DUPLICATE_NAME" });
      brand.name = name;
    }

    // Remove logo if explicitly {"logo": null}
    if (hasJson && Object.prototype.hasOwnProperty.call(req.body, "logo") && req.body.logo === null) {
      if (brand.logo) await deleteLocal(brand.logo);
      brand.logo = null;
    }

    // Replace logo via multipart
    if (req.file?.buffer) {
      await assertImageBuffer(req.file.buffer, MAX_IMG);
      const folder = brandUploadsFolderFor(brand._id);
      const newPath = await saveWebpContain300(req.file.buffer, folder);
      const old = brand.logo;
      brand.logo = newPath;
      if (old && old !== newPath) await deleteLocal(old);
    }

    await brand.save();
    return res.json({ ok: true, data: toClient(brand) });
  },

  // DELETE /admin/brands/:id
  async remove(req, res) {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ ok: false, code: 404, message: "Not found" });

    // Dependency check placeholder (products module not in this project)
    // If integrating products later, block when dependencies exist -> 409 DEPENDENCY_BLOCK

    const old = brand.logo;
    await Brand.deleteOne({ _id: brand._id });
    if (old) await deleteLocal(old).catch(() => {});
    return res.json({ ok: true });
  },

  // PATCH /admin/brands/:id/status  { isActive: boolean }
  async toggleStatus(req, res) {
    const { isActive } = req.body || {};
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ ok: false, code: 400, message: "isActive boolean required" });
    }
    const b = await Brand.findByIdAndUpdate(req.params.id, { $set: { isActive } }, { new: true });
    if (!b) return res.status(404).json({ ok: false, code: 404, message: "Not found" });
    return res.json({ ok: true, data: toClient(b) });
  },

  // GET /admin/brands/search?q=&page=&pageSize=&sort=&order=
  async search(req, res) {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.status(400).json({ ok: false, code: 400, message: "q must be ≥ 2 chars" });

    const page = clamp(parseInt(req.query.page || "1"), 1, 1e9);
    const pageSize = clamp(parseInt(req.query.pageSize || "10"), 1, 50);
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
      Brand.find(cond).collation({ locale: "en", strength: 2 })
        .sort(sortObj).skip(skip).limit(pageSize).lean(),
      Brand.countDocuments(cond)
    ]);

    return res.json({ ok: true, data: items.map(toClient), meta: { page, pageSize, total } });
  },

  // GET /admin/brands/metrics
  async metrics(req, res) {
    const [total, active, inactive] = await Promise.all([
      Brand.countDocuments({}),
      Brand.countDocuments({ isActive: true }),
      Brand.countDocuments({ isActive: false })
    ]);
    return res.json({ ok: true, total, active, inactive });
  }
};

function toClient(b) {
  return { ...b, logo: b.logo ? toPublic(b.logo) : null };
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
