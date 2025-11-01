"use strict";

import { Router } from "express";
import PublicBrandController from "../controllers/PublicBrandController.js";

const r = Router();

// /public/brands*
r.get("/brands", PublicBrandController.list);
r.get("/brands/:slug/products", PublicBrandController.products);

export default r;
