"use strict";

import { Router } from "express";
import { authAdmin } from "../../../middlewares/authAdmin.js";
import AdminBlogCategoryController from "../controllers/AdminBlogCategoryController.js";

const r = Router();

// /admin/blog-categories
r.post("/", authAdmin, AdminBlogCategoryController.create);
r.get("/", authAdmin, AdminBlogCategoryController.list);
r.get("/metrics", authAdmin, AdminBlogCategoryController.metrics);
r.get("/:id", authAdmin, AdminBlogCategoryController.read);
r.put("/:id", authAdmin, AdminBlogCategoryController.update);
r.delete("/:id", authAdmin, AdminBlogCategoryController.remove);
r.patch("/:id/status", authAdmin, AdminBlogCategoryController.toggleStatus);

export default r;
