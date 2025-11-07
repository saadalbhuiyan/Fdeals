"use strict";

/**
 * User Auth Routes
 * ---------------------------------------------------------
 *   POST   /auth/otp/request   -> send OTP email (rate-limited)
 *   POST   /auth/otp/verify    -> verify OTP, login or register user
 *   POST   /auth/refresh       -> rotate refresh token (CSRF protected)
 *   POST   /auth/logout        -> revoke current session (CSRF protected)
 *   DELETE /auth/account       -> delete user account (requires access token)
 * ---------------------------------------------------------
 */

import { Router } from "express";
import { authUser } from "../../../middlewares/authUser.js";

// ⬇️ Named imports from controller
import {
  otpRequest,
  otpVerify,
  refresh,
  logout,
  deleteAccount
} from "../controllers/UserAuthController.js";

const router = Router();

/* --------------------------- OTP-based login flow --------------------------- */
router.post("/otp/request", otpRequest);
router.post("/otp/verify", otpVerify);

/* --------------------------- Token management --------------------------- */
// CSRF protection is handled inside the controller.
router.post("/refresh", refresh);
router.post("/logout", logout);

/* --------------------------- Account management --------------------------- */
// Requires valid access token
router.delete("/account", authUser, deleteAccount);

export default router;
