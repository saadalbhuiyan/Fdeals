"use strict";

/**
 * Admin Blog Routes (named exports version)
 * Summary:
 *   Provides admin-only endpoints for managing blogs.
 *   Requires admin authentication (authAdmin middleware).
 */

import { Router } from "express";
import { authAdmin } from "../../../middlewares/authAdmin.js"; // verify admin JWT
import { upload } from "../../../config/multer.js";             // handles file uploads

// Named imports from controller
import {
  create,
  list,
  metrics,
  search,
  read,
  update,
  remove,
  toggleStatus,
  uploadInlineImage
} from "../controllers/AdminBlogController.js";

const r = Router();

/* ------------------------------- BLOG ROUTES ------------------------------- */
// Create new blog (multipart: heroImage)
r.post("/", authAdmin, upload.single("heroImage"), create);

// Get paginated list of blogs
r.get("/", authAdmin, list);

// Get metrics (total, active/inactive counts, etc.)
r.get("/metrics", authAdmin, metrics);

// Search blogs by keyword
r.get("/search", authAdmin, search);

// Get single blog by ID
r.get("/:id", authAdmin, read);

// Update blog info or replace hero image
r.put("/:id", authAdmin, upload.single("heroImage"), update);

// Delete blog and related images
r.delete("/:id", authAdmin, remove);

// Toggle active/inactive status
r.patch("/:id/status", authAdmin, toggleStatus);

// Upload inline image for blog editor
r.post("/:id/images", authAdmin, upload.single("image"), uploadInlineImage);

export default r;
