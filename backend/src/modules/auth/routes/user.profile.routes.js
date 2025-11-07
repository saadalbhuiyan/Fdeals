"use strict";

/**
 * User Profile Routes
 * Field-level routes for authenticated users to manage their own profile.
 *
 *   /user/profile/name
 *   /user/profile/picture
 *   /user/profile/address
 *   /user/profile/mobile
 */

import { Router } from "express";
import { authUser } from "../../../middlewares/authUser.js";
import { upload } from "../../../config/multer.js";


import {
  getName,
  setName,
  clearName,
  getPicture,
  setPicture,
  clearPicture,
  getAddress,
  setAddress,
  clearAddress,
  getMobile,
  setMobile,
  clearMobile
} from "../controllers/UserProfileController.js";

const router = Router();

/* ------------------------------ NAME ------------------------------ */
router.get("/name", authUser, getName);
router.patch("/name", authUser, setName);
router.delete("/name", authUser, clearName);

/* ----------------------------- PICTURE ----------------------------- */
router.get("/picture", authUser, getPicture);
router.patch("/picture", authUser, upload.single("picture"), setPicture);
router.delete("/picture", authUser, clearPicture);

/* ----------------------------- ADDRESS ----------------------------- */
router.get("/address", authUser, getAddress);
router.patch("/address", authUser, setAddress);
router.delete("/address", authUser, clearAddress);

/* ------------------------------ MOBILE ----------------------------- */
router.get("/mobile", authUser, getMobile);
router.patch("/mobile", authUser, setMobile);
router.delete("/mobile", authUser, clearMobile);

export default router;
