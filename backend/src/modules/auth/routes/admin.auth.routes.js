"use strict";

import { Router } from "express";
import AdminAuthController from "../controllers/AdminAuthController.js";

const r = Router();

/**
 * /admin/auth
 */
r.post("/login", AdminAuthController.login);
r.post("/refresh", AdminAuthController.refresh);
r.post("/logout", AdminAuthController.logout);

export default r;
