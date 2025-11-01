"use strict";

/**
 * Single entry:
 * - dotenv load (must be before any other imports)
 * - express init
 * - security middleware (helmet, cors, compression)
 * - rate limit
 * - routes mount
 * - error handling
 * - pretty startup banner (single ✅ print)
 */

/* Load env at module-evaluation time (before all other imports). */
import "dotenv/config";

import "express-async-errors";
import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import http from "node:http";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { connectMongo } from "./src/config/db.js";

// Auth module routes
import adminAuthRoutes from "./src/modules/auth/routes/admin.auth.routes.js";
import adminProfileRoutes from "./src/modules/auth/routes/admin.profile.routes.js";
import adminSmtpRoutes from "./src/modules/auth/routes/admin.smtp.routes.js";
import adminUsersRoutes from "./src/modules/auth/routes/admin.users.routes.js";
import userAuthRoutes from "./src/modules/auth/routes/user.auth.routes.js";
import userProfileRoutes from "./src/modules/auth/routes/user.profile.routes.js";

// Blog module routes
import adminBlogRoutes from "./src/modules/blog/routes/admin.blog.routes.js";
import adminBlogCategoryRoutes from "./src/modules/blog/routes/admin.blogCategory.routes.js";
import publicBlogRoutes from "./src/modules/blog/routes/public.blog.routes.js";

// Brand module routes
import adminBrandRoutes from "./src/modules/brand/routes/admin.brand.routes.js";
import publicBrandRoutes from "./src/modules/brand/routes/public.brand.routes.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const app = express();

// --- Env sanity checks (fail fast in prod, warn in dev)
const requiredEnv = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "MONGODB_URI",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD"
];
const missing = requiredEnv.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
if (missing.length) {
  const msg = `[ENV] Missing required variables: ${missing.join(", ")}`;
  if (process.env.NODE_ENV === "production") {
    // Crash in prod to avoid running with broken security settings
    console.error(msg);
    process.exit(1);
  } else {
    console.warn("[WARN]", msg);
  }
}

// --- Ensure uploads directories exist
["uploads", "uploads/admin", "uploads/user", "uploads/blogs", "uploads/brands"].forEach((p) => {
  const fp = path.join(__dirname, p);
  if (!fs.existsSync(fp)) fs.mkdirSync(fp, { recursive: true });
});

// --- Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());

const corsOrigin =
  process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean) ||
  ["http://localhost:5173"];
app.use(cors({ origin: corsOrigin, credentials: true }));

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// --- Logging
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// --- Static uploads
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders(res) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  })
);

// --- Global rate limit
const globalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 429, message: "Too many requests" }
});
app.use(globalLimiter);

// --- CSRF seed endpoint (double-submit cookie)
app.get("/csrf", (req, res) => {
  const token = cryptoRandom(24);
  const cookieName = process.env.CSRF_COOKIE_NAME || "csrf";
  const secure =
    process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  const domain = process.env.COOKIE_DOMAIN || undefined;
  res.cookie(cookieName, token, {
    httpOnly: false,
    sameSite: secure ? "strict" : "lax",
    secure,
    domain,
    path: "/",
    maxAge: 7 * 24 * 3600 * 1000
  });
  res.json({ ok: true, token });
});

// --- Mount routes
app.use("/admin/auth", adminAuthRoutes);
app.use("/admin/profile", adminProfileRoutes);
app.use("/admin/smtp", adminSmtpRoutes);
app.use("/admin/users", adminUsersRoutes);

app.use("/auth", userAuthRoutes);
app.use("/user/profile", userProfileRoutes);

app.use("/admin/blogs", adminBlogRoutes);
app.use("/admin/blog-categories", adminBlogCategoryRoutes);
app.use("/public", publicBlogRoutes);

app.use("/admin/brands", adminBrandRoutes);
app.use("/public", publicBrandRoutes);

// --- Health
app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

// --- 404
app.use((req, res) => {
  res.status(404).json({ ok: false, code: 404, message: "Not found" });
});

// --- Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[ERR]", err);
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    code: status,
    message: err.publicMessage || err.message || "Internal error"
  });
});

// --- Server start (pretty single ✅ banner)
const port = Number(process.env.PORT || 4000);
const server = http.createServer(app);

start();

async function start() {
  try {
    await connectMongo(); // success — banner prints once below
    server.listen(port, () => {
      const base = process.env.BASE_URL || `http://localhost:${port}`;
      console.log("\n=========================================");
      console.log("✅  MongoDB connected successfully");
      console.log(`✅  API server running at: ${base}`);
      console.log("=========================================\n");
    });
  } catch (err) {
    console.error("❌ Failed to start:", err?.message || err);
    process.exit(1);
  }
}

// --- small utility
function cryptoRandom(len = 24) {
  return Buffer.from(
    Array.from({ length: len }, () => Math.floor(Math.random() * 256))
  ).toString("base64url");
}
