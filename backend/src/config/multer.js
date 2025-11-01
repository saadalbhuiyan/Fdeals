"use strict";

import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

/**
 * Memory storage so we can verify magic bytes before writing to disk.
 */
const storage = multer.memoryStorage();

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // Blog/Brand ≤ 2MB; Admin/User ≤ 1MB (validated again per controller)

export const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: async (req, file, cb) => {
    try {
      // Multer may not have full buffer here; validation will re-run in controllers.
      // Accept here tentatively; hard validation later.
      cb(null, true);
    } catch (e) {
      cb(e);
    }
  }
});

/**
 * Strong validation by magic-bytes on a buffer.
 */
export async function assertImageBuffer(buffer, allowMaxBytes) {
  if (!buffer || !buffer.length) {
    const err = new Error("No file content");
    err.status = 415;
    throw err;
  }
  if (buffer.length > allowMaxBytes) {
    const err = new Error("Image too large");
    err.status = 413;
    throw err;
  }
  const ft = await fileTypeFromBuffer(buffer);
  const ok = ft && ["image/jpeg", "image/png", "image/webp"].includes(ft.mime);
  if (!ok) {
    const err = new Error("Unsupported / non-image file");
    err.status = 415;
    throw err;
  }
  return ft.mime;
}
