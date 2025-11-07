"use strict";

/**
 * Admin SMTP Routes
 * ---------------------------------------------------------
 * CRUD endpoints for managing SMTP configuration (admin-only).
 * Each route requires valid admin authentication via authAdmin middleware.
 *
 * Routes:
 *   POST   /admin/smtp   -> create or replace config
 *   GET    /admin/smtp   -> read config
 *   PUT    /admin/smtp   -> partial update (re-verify)
 *   DELETE /admin/smtp   -> delete config
 * ---------------------------------------------------------
 */

import { Router } from "express";
import { authAdmin } from "../../../middlewares/authAdmin.js";

// 🧩 Import named controller functions
import { create, read, update, remove } from "../controllers/AdminSmtpController.js";

const router = Router();

/* ----------------------------- SMTP CONFIG ----------------------------- */
router.post("/", authAdmin, create);
router.get("/", authAdmin, read);
router.put("/", authAdmin, update);
router.delete("/", authAdmin, remove);

export default router;
