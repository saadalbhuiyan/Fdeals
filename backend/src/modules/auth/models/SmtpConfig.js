"use strict";

/**
 * SMTP Config (single record only)
 * Fields: host, port, username, password
 */

import mongoose from "mongoose";

const SmtpSchema = new mongoose.Schema(
  {
    host: { type: String, required: true, trim: true },
    port: { type: Number, required: true, min: 1, max: 65535 },
    username: { type: String, required: true, trim: true },
    password: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

export default mongoose.model("SmtpConfig", SmtpSchema);
