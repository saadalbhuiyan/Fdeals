"use strict";

import { Router } from "express";
import PublicBlogController from "../controllers/PublicBlogController.js";

const r = Router();

// /public/*
r.get("/blogs", PublicBlogController.list);
r.get("/blogs/search", PublicBlogController.search);
r.get("/blogs/category/:slug", PublicBlogController.byCategory);
r.get("/blogs/:slug", PublicBlogController.read);
r.get("/blog-categories", PublicBlogController.categories);

export default r;
