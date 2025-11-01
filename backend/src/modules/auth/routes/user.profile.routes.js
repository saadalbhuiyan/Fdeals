"use strict";

import { Router } from "express";
import { authUser } from "../../../middlewares/authUser.js";
import { upload } from "../../../config/multer.js";
import UserProfileController from "../controllers/UserProfileController.js";

const r = Router();

/**
 * /user/profile/*
 */
r.get("/name", authUser, UserProfileController.getName);
r.patch("/name", authUser, UserProfileController.setName);
r.delete("/name", authUser, UserProfileController.clearName);

r.get("/picture", authUser, UserProfileController.getPicture);
r.patch("/picture", authUser, upload.single("picture"), UserProfileController.setPicture);
r.delete("/picture", authUser, UserProfileController.clearPicture);

r.get("/address", authUser, UserProfileController.getAddress);
r.patch("/address", authUser, UserProfileController.setAddress);
r.delete("/address", authUser, UserProfileController.clearAddress);

r.get("/mobile", authUser, UserProfileController.getMobile);
r.patch("/mobile", authUser, UserProfileController.setMobile);
r.delete("/mobile", authUser, UserProfileController.clearMobile);

export default r;
