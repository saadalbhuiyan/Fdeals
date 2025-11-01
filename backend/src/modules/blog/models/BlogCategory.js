"use strict";

import mongoose from "mongoose";

const BlogCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("BlogCategory", BlogCategorySchema);
