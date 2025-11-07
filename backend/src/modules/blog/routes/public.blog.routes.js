"use strict";

/**
 * Public Blog Routes (named exports version)
 * Summary:
 *   Exposes public read-only endpoints for blogs and blog categories.
 *   No authentication required — only active blogs & categories are shown.
 *
 *   Endpoints:
 *     GET /public/blogs                -> Paginated list of active blogs
 *     GET /public/blogs/search         -> Search active blogs by keyword
 *     GET /public/blogs/category/:slug -> Blogs filtered by active category
 *     GET /public/blogs/:slug          -> Read single active blog by slug
 *     GET /public/blog-categories      -> List all active categories
 */

import { Router } from "express";

// Named imports from the controller
import {
  list,
  search,
  byCategory,
  read,
  categories
} from "../controllers/PublicBlogController.js";

const r = Router();

/* ----------------------------- PUBLIC ROUTES ----------------------------- */
// Get paginated list of active blogs
r.get("/blogs", list);

// Search active blogs by keyword
r.get("/blogs/search", search);

// Get all blogs under a specific active category (by slug)
r.get("/blogs/category/:slug", byCategory);

// Get single active blog by slug
r.get("/blogs/:slug", read);

// Get list of all active blog categories
r.get("/blog-categories", categories);

export default r;
