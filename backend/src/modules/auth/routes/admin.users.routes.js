"use strict";

/**
 * Admin User Insight Routes
 * ---------------------------------------------------------
 * Provides admin-only analytics endpoints for user data.
 * Requires valid admin authentication via authAdmin middleware.
 *
 * Routes:
 *   GET /admin/users/count  -> total user count
 *   GET /admin/users        -> paginated user list
 * ---------------------------------------------------------
 */

import { Router } from "express";
import { authAdmin } from "../../../middlewares/authAdmin.js";
import { count, list } from "../controllers/AdminUserInsightController.js";

const router = Router();

/* ----------------------------- USER INSIGHTS ----------------------------- */
router.get("/count", authAdmin, count); // Get total user count
router.get("/", authAdmin, list);       // Get paginated user list

export default router;
