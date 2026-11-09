/**
 * Gets a sub's job photo ready on the phone before upload (subPhotos.ts):
 * turned upright, longest side 1600px, JPEG around 250 KB instead of 2-4 MB,
 * with the date and time stamped in the corner. Browser only.
 */

const MAX_SIDE = 1600;
const QUALITY = 0.75;

function stampText(at: Date): string {
  return at.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    // imageOrientation from-image applies the phone's rotation tag
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The photo to upload. If this browser can't read the file (rare formats),
 * the original goes up and the server converts it.
 */
export async function preparePhoto(file: File, takenAt: Date): Promise<Blob> {
  try {
    const img = await decode(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img.source, 0, 0, width, height);
    img.close();

    const text = stampText(takenAt);
    const size = Math.max(14, Math.round(Math.min(width, height) / 28));
    ctx.font = `600 ${size}px system-ui, -apple-system, sans-serif`;
    const pad = Math.round(size * 0.5);
    const boxW = ctx.measureText(text).width + pad * 2;
    const boxH = size + pad * 2;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(width - boxW - pad, height - boxH - pad, boxW, boxH);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width - boxW, height - pad - boxH / 2);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    return blob ?? file;
  } catch {
    return file;
  }
}
