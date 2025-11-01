"use strict";

import { Router } from "express";
import { authAdmin } from "../../../middlewares/authAdmin.js";
import AdminUserInsightController from "../controllers/AdminUserInsightController.js";

const r = Router();

/**
 * /admin/users
 */
r.get("/count", authAdmin, AdminUserInsightController.count);
r.get("/", authAdmin, AdminUserInsightController.list);

export default r;
