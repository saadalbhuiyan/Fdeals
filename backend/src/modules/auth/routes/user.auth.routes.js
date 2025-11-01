"use strict";

import { Router } from "express";
import UserAuthController from "../controllers/UserAuthController.js";
import { authUser } from "../../../middlewares/authUser.js"; // ✅ add this

const r = Router();

/**
 * /auth
 */
r.post("/otp/request", UserAuthController.otpRequest);
r.post("/otp/verify", UserAuthController.otpVerify);

// refresh/logout-এ CSRF চেক আছে; access token বাধ্যতামূলক না।
// চাইলে নিরাপত্তার জন্য logout-এও authUser দিতে পারো।
r.post("/refresh", UserAuthController.refresh);
r.post("/logout", UserAuthController.logout);

// ✅ এখানে অবশ্যই authUser লাগবে — access token থেকে req.auth.sub সেট হবে
r.delete("/account", authUser, UserAuthController.deleteAccount);

export default r;
