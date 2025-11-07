"use strict";

/**
 * Admin Brand Routes (beginner-friendly)
 * Summary:
 *   Handles all admin-only routes for brand management.
 *   Requires admin authentication (authAdmin middleware).
 *
 *   Endpoints:
 *     POST   /admin/brands              -> Create new brand (optional logo)
 *     GET    /admin/brands              -> Paginated list of brands
 *     GET    /admin/brands/metrics      -> Count total/active/inactive brands
 *     GET    /admin/brands/search       -> Search brands by name/slug
 *     GET    /admin/brands/:id          -> Read single brand details
 *     PATCH  /admin/brands/:id          -> Update brand name or logo
 *     DELETE /admin/brands/:id          -> Delete brand
 *     PATCH  /admin/brands/:id/status   -> Activate/Deactivate brand
 */

import { Router } from "express";
import { authAdmin } from "../../../middlewares/authAdmin.js"; // checks if admin is logged in
import { upload } from "../../../config/multer.js";             // handles multipart/form-data uploads
import AdminBrandController from "../controllers/AdminBrandController.js";

const r = Router();

/* ------------------------------- BRAND ROUTES ------------------------------ */
// Create a new brand (logo optional on creation)
r.post("/", authAdmin, upload.single("logo"), AdminBrandController.create);

// Get list of all brands (supports pagination & sorting)
r.get("/", authAdmin, AdminBrandController.list);

// Get brand metrics (total/active/inactive)
r.get("/metrics", authAdmin, AdminBrandController.metrics);

// Search brands by keyword
r.get("/search", authAdmin, AdminBrandController.search);

// Read single brand details by ID
r.get("/:id", authAdmin, AdminBrandController.read);

// Update brand (can change name or logo)
r.patch("/:id", authAdmin, upload.single("logo"), AdminBrandController.update);

// Delete brand by ID
r.delete("/:id", authAdmin, AdminBrandController.remove);

// Toggle brand active/inactive status
r.patch("/:id/status", authAdmin, AdminBrandController.toggleStatus);

export default r;
