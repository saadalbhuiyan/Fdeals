"use strict";

/**
 * Image helpers:
 * - magic-byte sniff handled in multer assertImageBuffer
 * - sharp-based processing pipelines
 */

import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

export async function saveWebpCover512(buffer, folder) {
  await fs.mkdir(folder, { recursive: true });
  const file = `${randomUUID()}.webp`;
  const outPath = path.join(folder, file);
  const pipeline = sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize(512, 512, { fit: "cover" })
    .webp({ quality: 82 });

  await pipeline.toFile(outPath);
  return outPath;
}

export async function saveWebpContain300(buffer, folder) {
  await fs.mkdir(folder, { recursive: true });
  const file = `${randomUUID()}.webp`;
  const outPath = path.join(folder, file);
  await sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize(300, 300, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88 })
    .toFile(outPath);
  return outPath;
}

// Blog variants
export async function saveBlogHero1200x630(buffer, folder) {
  await fs.mkdir(folder, { recursive: true });
  const file = `hero-${randomUUID()}.webp`;
  const outPath = path.join(folder, file);
  await sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize(1200, 630, { fit: "cover" })
    .webp({ quality: 85 })
    .toFile(outPath);
  return outPath;
}

export async function saveBlogThumb400x250(buffer, folder) {
  await fs.mkdir(folder, { recursive: true });
  const file = `thumb-${randomUUID()}.webp`;
  const outPath = path.join(folder, file);
  await sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize(400, 250, { fit: "cover" })
    .webp({ quality: 80 })
    .toFile(outPath);
  return outPath;
}

export async function saveBlogInline800(buffer, folder) {
  await fs.mkdir(folder, { recursive: true });
  const file = `content-${randomUUID()}.webp`;
  const outPath = path.join(folder, file);
  await sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(outPath);
  return outPath;
}

export async function deleteLocal(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch { /* ignore */ }
}
