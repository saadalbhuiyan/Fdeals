"use strict";

/**
 * Admin Blog Category Routes (named exports version)
 * Summary:
 *   Provides admin-only endpoints for managing blog categories.
 *   Requires admin authentication (authAdmin middleware).
 *
 *   Endpoints:
 *     POST   /admin/blog-categories          -> Create a new category
 *     GET    /admin/blog-categories          -> Paginated list of categories
 *     GET    /admin/blog-categories/metrics  -> Category statistics
 *     GET    /admin/blog-categories/:id      -> Read single category
 *     PUT    /admin/blog-categories/:id      -> Update category name (slug immutable)
 *     DELETE /admin/blog-categories/:id      -> Delete category (blocked if blogs exist)
 *     PATCH  /admin/blog-categories/:id/status -> Toggle active/inactive status
 */

import { Router } from "express";
import { authAdmin } from "../../../middlewares/authAdmin.js";

// Named imports from controller (no default export)
import {
  create,
  list,
  read,
  update,
  remove,
  toggleStatus,
  metrics
} from "../controllers/AdminBlogCategoryController.js";

const r = Router();

/* -------------------------- BLOG CATEGORY ROUTES -------------------------- */

// Create new category
r.post("/", authAdmin, create);

// List categories (with pagination and optional blog counts)
r.get("/", authAdmin, list);

// Get category metrics (total, active, inactive)
r.get("/metrics", authAdmin, metrics);

// Read single category by ID
r.get("/:id", authAdmin, read);

// Update category name (slug stays same)
r.put("/:id", authAdmin, update);

// Delete category (blocked if it has linked blogs)
r.delete("/:id", authAdmin, remove);

// Activate/Deactivate category
r.patch("/:id/status", authAdmin, toggleStatus);

export default r;
