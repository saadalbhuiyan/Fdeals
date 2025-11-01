"use strict";

import { Router } from "express";
import { authAdmin } from "../../../middlewares/authAdmin.js";
import { upload } from "../../../config/multer.js";
import AdminBrandController from "../controllers/AdminBrandController.js";

const r = Router();

// /admin/brands
r.post("/", authAdmin, upload.single("logo"), AdminBrandController.create);
r.get("/", authAdmin, AdminBrandController.list);
r.get("/metrics", authAdmin, AdminBrandController.metrics);
r.get("/search", authAdmin, AdminBrandController.search);
r.get("/:id", authAdmin, AdminBrandController.read);
r.patch("/:id", authAdmin, upload.single("logo"), AdminBrandController.update);
r.delete("/:id", authAdmin, AdminBrandController.remove);
r.patch("/:id/status", authAdmin, AdminBrandController.toggleStatus);

export default r;
