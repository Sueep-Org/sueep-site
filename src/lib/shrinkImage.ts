/**
 * Vercel rejects request bodies over ~4.5 MB before our route ever runs, and
 * most phone photos are bigger than that, so large images get downscaled in
 * the browser first. Browser only.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const SHRINK_OVER_BYTES = 1.5 * 1024 * 1024;
const MAX_DIMENSION = 2400;

export async function shrinkImage(file: File): Promise<File> {
  if (file.size <= SHRINK_OVER_BYTES || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    // Browser can't decode this format (e.g. HEIC outside Safari), so send as-is.
    return file;
  }
}
