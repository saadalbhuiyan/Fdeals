"use strict";

/**
 * Public Brand Routes (beginner-friendly)
 * Summary:
 *   Public-facing brand APIs — no authentication required.
 *   Only active brands with a valid logo are shown.
 *
 *   Endpoints:
 *     GET /public/brands               -> List all active brands (paginated)
 *     GET /public/brands/:slug/products -> Get products of a brand (currently returns empty list)
 */

import { Router } from "express";
import PublicBrandController from "../controllers/PublicBrandController.js";

const r = Router();

/* ------------------------------- PUBLIC ROUTES ------------------------------ */
// Get all active brands that have a logo (public-visible)
r.get("/brands", PublicBrandController.list);

// Get a brand’s products by slug (returns empty until products module exists)
r.get("/brands/:slug/products", PublicBrandController.products);

export default r;
