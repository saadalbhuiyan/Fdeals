"use strict";

import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema({
  // Only 1 admin row kept for profile (name, picture). Credentials come from ENV.
  email: { type: String, index: true, unique: true },
  name: { type: String, default: null, maxlength: 50 },
  picture: { type: String, default: null } // file path
}, { timestamps: true });

export default mongoose.model("Admin", AdminSchema);
