"use strict";

import mongoose from "mongoose";

const RefreshTokenSchema = new mongoose.Schema({
  sid: { type: String, index: true, unique: true },
  subjectId: { type: String, index: true },
  role: { type: String, enum: ["admin", "user"], index: true },
  tokenHash: { type: String, required: true },
  ua: { type: String, default: "" },
  ip: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  rotatedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null }
}, { timestamps: false });

export default mongoose.model("RefreshToken", RefreshTokenSchema);
