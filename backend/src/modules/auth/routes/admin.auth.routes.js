"use strict";

/**
 * Admin Auth Routes
 * ---------------------------------------------------------
 * Handles admin authentication using .env credentials.
 * Uses secure JWT + HttpOnly cookies for access/refresh flow.
 *
 * Routes:
 *   POST /admin/auth/login   -> Authenticate admin & issue tokens
 *   POST /admin/auth/refresh -> Rotate refresh token (cookie-based)
 *   POST /admin/auth/logout  -> Revoke refresh token & clear cookie
 * ---------------------------------------------------------
 */

import { Router } from "express";

// 🧩 Import named controller functions
import { login, refresh, logout } from "../controllers/AdminAuthController.js";

const router = Router();

/* ------------------------------ AUTH ------------------------------ */
router.post("/login", login);       // Admin login
router.post("/refresh", refresh);   // Refresh token rotation
router.post("/logout", logout);     // Logout + revoke session

export default router;
