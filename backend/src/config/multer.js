"use strict";

/**
 * Beginner-friendly version of multer config for image upload
 * ------------------------------------------------------------
 * This setup:
 * - Uses memory storage (stores file in RAM instead of disk)
 * - Limits file size
 * - Checks image validity later by reading its bytes (magic bytes)
 */

import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

// Memory-based storage — image stays in buffer (RAM), not saved to disk yet
const storage = multer.memoryStorage();

// Max file size = 2MB (controllers can apply smaller limits if needed)
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Multer middleware for handling file uploads
 * - Stores file in memory
 * - Temporarily allows all uploads (final check done later)
 */
export const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: async (req, file, cb) => {
    try {
      // ✅ Allow the file for now (basic check)
      // Later, controllers will re-validate the actual file type using magic bytes.
      cb(null, true);
    } catch (error) {
      cb(error);
    }
  }
});

/**
 * Validate an image buffer strongly using magic bytes
 * ---------------------------------------------------
 * This function makes sure the uploaded buffer:
 * 1. Exists and isn't empty
 * 2. Isn't too large
 * 3. Actually represents an image (JPEG, PNG, or WEBP)
 */
export async function assertImageBuffer(buffer, allowMaxBytes) {
  // Step 1: No content at all
  if (!buffer || !buffer.length) {
    const err = new Error("No file content");
    err.status = 415; // Unsupported Media Type
    throw err;
  }

  // Step 2: Check file size limit
  if (buffer.length > allowMaxBytes) {
    const err = new Error("Image too large");
    err.status = 413; // Payload Too Large
    throw err;
  }

  // Step 3: Detect the real file type (magic-byte sniffing)
  const detected = await fileTypeFromBuffer(buffer);
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const isValid = detected && allowedTypes.includes(detected.mime);

  // Step 4: Reject unsupported formats
  if (!isValid) {
    const err = new Error("Unsupported or non-image file");
    err.status = 415;
    throw err;
  }

  // ✅ Valid image → return MIME type (like "image/webp")
  return detected.mime;
}
