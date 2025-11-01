"use strict";

import mongoose from "mongoose";

const BlogSchema = new mongoose.Schema({
  title: { type: String, required: true, minlength: 3, maxlength: 120, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, required: true }, // sanitized HTML
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "BlogCategory", required: true, index: true },
  isActive: { type: Boolean, default: true },

  heroImage: { type: String, required: true }, // path
  thumbImage: { type: String, required: true }  // path
}, { timestamps: true });

export default mongoose.model("Blog", BlogSchema);
