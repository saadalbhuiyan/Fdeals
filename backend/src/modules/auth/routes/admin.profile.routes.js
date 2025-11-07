"use strict";

/**
 * Admin Profile Routes
 * Field-level routes for admin profile management.
 *
 * /admin/profile/name      -> GET (read), PATCH (update), DELETE (clear)
 * /admin/profile/picture   -> GET (read), PATCH (upload), DELETE (remove)
 */

import { Router } from "express";
import { upload } from "../../../config/multer.js";
import { authAdmin } from "../../../middlewares/authAdmin.js";

// ⬇️ Import named controller functions
import {
  getName,
  setName,
  clearName,
  getPicture,
  setPicture,
  clearPicture
} from "../controllers/AdminProfileController.js";

const router = Router();

/* ------------------------------ NAME ------------------------------ */
router.get("/name", authAdmin, getName);
router.patch("/name", authAdmin, setName);
router.delete("/name", authAdmin, clearName);

/* ----------------------------- PICTURE ----------------------------- */
router.get("/picture", authAdmin, getPicture);
router.patch("/picture", authAdmin, upload.single("picture"), setPicture);
router.delete("/picture", authAdmin, clearPicture);

export default router;
