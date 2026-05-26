import { BlockBlobClient } from "https://cdn.jsdelivr.net/npm/@azure/storage-blob/+esm";

export async function uploadDirectToBlob(file, folder = null, onProgress) {
  const initRes = await fetch("/api/files/upload-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, type: file.type, folder, anonymous: true })
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error(`upload-init failed: ${t}`);
  }
  const { uploadUrl, blobUrl } = await initRes.json();
  const client = new BlockBlobClient(uploadUrl);
  await client.uploadData(file, {
    blockSize: 4 * 1024 * 1024,
    concurrency: 4,
    onProgress: (e) => {
      if (onProgress && file.size) onProgress(e.loadedBytes / file.size);
    }
  });
  const props = await client.getProperties();
  return { blobUrl, etag: props.etag };
}

export async function uploadSmallFallback(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
  if (!res.ok) return { ok: false, status: res.status, text: await res.text() };
  return { ok: true, ...(await res.json()) };
} 