"use strict";

import mongoose from "mongoose";
import validator from "validator";

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, "Invalid email"]
  },
  name: { type: String, default: null, maxlength: 50 },
  picture: { type: String, default: null }, // path
  // plain text address <= 500 chars
  address: { type: String, default: null, maxlength: 500 },
  mobile: { type: String, default: null }, // store E.164 normalized if provided
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("User", UserSchema);
