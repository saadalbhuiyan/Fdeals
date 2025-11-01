"use strict";

import { Router } from "express";
import { upload } from "../../../config/multer.js";
import { authAdmin } from "../../../middlewares/authAdmin.js";
import AdminProfileController from "../controllers/AdminProfileController.js";

const r = Router();

/**
 * /admin/profile/name
 */
r.get("/name", authAdmin, AdminProfileController.getName);
r.patch("/name", authAdmin, AdminProfileController.setName);
r.delete("/name", authAdmin, AdminProfileController.clearName);

/**
 * /admin/profile/picture
 */
r.get("/picture", authAdmin, AdminProfileController.getPicture);
r.patch("/picture", authAdmin, upload.single("picture"), AdminProfileController.setPicture);
r.delete("/picture", authAdmin, AdminProfileController.clearPicture);

export default r;
