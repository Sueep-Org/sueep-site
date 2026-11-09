/**
 * Server-side photo shrink shared by sub portal photos (subPhotos.ts) and
 * turnover checklist photos: turned upright, longest side 1600px, JPEG, all
 * EXIF dropped (so a phone's GPS tags never get stored), plus a 320px
 * preview. Server only.
 */
import sharp from "sharp";

const FULL_PX = 1600;
const THUMB_PX = 320;
/** Refuse images bigger than this many pixels before decoding (decompression bombs) */
const MAX_INPUT_PIXELS = 50_000_000;

export type ProcessedPhoto = { full: Buffer; thumb: Buffer; width: number; height: number };

/** Upright, shrunk, metadata-free JPEGs. Throws when the bytes aren't an image sharp can read (HEIC included). */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  const base = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const full = await base
    .clone()
    .resize({ width: FULL_PX, height: FULL_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: THUMB_PX, height: THUMB_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 62, mozjpeg: true })
    .toBuffer();
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}

/** "kitchen.HEIC" → "kitchen.jpg", for a photo re-encoded as JPEG */
export function jpegName(filename: string): string {
  const base = filename.replace(/\.[^./\\]+$/, "") || "photo";
  return `${base}.jpg`;
}
