"use strict";

/**
 * Beginner-friendly image helper functions
 * Each function:
 * 1. Ensures the folder exists
 * 2. Creates a unique file name
 * 3. Uses sharp to rotate, resize, and convert to WebP
 * 4. Saves the processed image and returns its file path
 */

import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

// 512×512 square image (cropped to fill)
export async function saveWebpCover512(buffer, folder) {
  // 1. Make sure the target folder exists
  await fs.mkdir(folder, { recursive: true });

  // 2. Create a unique file name with .webp extension
  const fileName = `${randomUUID()}.webp`;
  const outputPath = path.join(folder, fileName);

  // 3. Process and convert the image
  await sharp(buffer, { failOn: "warning" })
    .rotate() // fix EXIF rotation
    .resize(512, 512, { fit: "cover" }) // fill box, crop overflow
    .webp({ quality: 82 }) // web-friendly quality
    .toFile(outputPath);

  // 4. Return the saved file path
  return outputPath;
}

// 300×300 image (keeps full image, adds transparent padding if needed)
export async function saveWebpContain300(buffer, folder) {
  await fs.mkdir(folder, { recursive: true });

  const fileName = `${randomUUID()}.webp`;
  const outputPath = path.join(folder, fileName);

  await sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize(300, 300, {
      fit: "contain", // keep entire image visible
      background: { r: 0, g: 0, b: 0, alpha: 0 } // transparent background
    })
    .webp({ quality: 88 })
    .toFile(outputPath);

  return outputPath;
}

// 1200×630 blog hero image (cropped to fill)
export async function saveBlogHero1200x630(buffer, folder) {
  await fs.mkdir(folder, { recursive: true });

  const fileName = `hero-${randomUUID()}.webp`;
  const outputPath = path.join(folder, fileName);

  await sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize(1200, 630, { fit: "cover" })
    .webp({ quality: 85 })
    .toFile(outputPath);

  return outputPath;
}

// 400×250 blog thumbnail image
export async function saveBlogThumb400x250(buffer, folder) {
  await fs.mkdir(folder, { recursive: true });

  const fileName = `thumb-${randomUUID()}.webp`;
  const outputPath = path.join(folder, fileName);

  await sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize(400, 250, { fit: "cover" })
    .webp({ quality: 80 })
    .toFile(outputPath);

  return outputPath;
}

// Inline blog image (max width 800, no upscaling)
export async function saveBlogInline800(buffer, folder) {
  await fs.mkdir(folder, { recursive: true });

  const fileName = `content-${randomUUID()}.webp`;
  const outputPath = path.join(folder, fileName);

  await sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize({ width: 800, withoutEnlargement: true }) // only shrink, never enlarge
    .webp({ quality: 78 })
    .toFile(outputPath);

  return outputPath;
}

// Delete local file (if exists)
export async function deleteLocal(filePath) {
  if (!filePath) return; // skip if no file path provided
  try {
    await fs.unlink(filePath); // remove file
  } catch {
    // ignore if file already deleted or missing
  }
}
