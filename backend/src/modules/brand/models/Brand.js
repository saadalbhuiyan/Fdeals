"use strict";

import mongoose from "mongoose";

const BrandSchema = new mongoose.Schema({
  name: { type: String, required: true, minlength: 2, maxlength: 60, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  logo: { type: String, default: null }, // webp path
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("Brand", BrandSchema);
