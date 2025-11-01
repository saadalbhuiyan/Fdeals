"use strict";

/**
 * /admin/smtp routes
 * Only for authenticated Admins.
 */

import { Router } from "express";
import { authAdmin } from "../../../middlewares/authAdmin.js";
import AdminSmtpController from "../controllers/AdminSmtpController.js";

const r = Router();

r.post("/", authAdmin, AdminSmtpController.create);
r.get("/", authAdmin, AdminSmtpController.read);
r.put("/", authAdmin, AdminSmtpController.update);
r.delete("/", authAdmin, AdminSmtpController.remove);

export default r;
