"use strict";

import { Router } from "express";
import { authAdmin } from "../../../middlewares/authAdmin.js";
import { upload } from "../../../config/multer.js";
import AdminBlogController from "../controllers/AdminBlogController.js";

const r = Router();

// /admin/blogs
r.post("/", authAdmin, upload.single("heroImage"), AdminBlogController.create);
r.get("/", authAdmin, AdminBlogController.list);
r.get("/metrics", authAdmin, AdminBlogController.metrics);
r.get("/search", authAdmin, AdminBlogController.search);
r.get("/:id", authAdmin, AdminBlogController.read);
r.put("/:id", authAdmin, upload.single("heroImage"), AdminBlogController.update);
r.delete("/:id", authAdmin, AdminBlogController.remove);
r.patch("/:id/status", authAdmin, AdminBlogController.toggleStatus);
r.post("/:id/images", authAdmin, upload.single("image"), AdminBlogController.uploadInlineImage);

export default r;
