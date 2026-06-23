// =========================
// ENV-AWARE BACKEND (FIXED)
// =========================

// Auto-switch between local + production
const hostname = location.hostname.toLowerCase();
const isLocal =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "0.0.0.0" ||
  hostname.endsWith(".localhost") ||
  hostname.endsWith(".local") ||
  hostname.startsWith("192.168.") ||
  hostname.startsWith("10.") ||
  hostname.startsWith("172.");

export const API_BASE = isLocal
  ? "http://localhost:8000"
  : "https://ai-estimator-api-code-gaaaajezb3hfh9ex.eastus2-01.azurewebsites.net";

console.log("API_BASE =", API_BASE);

// =========================
// ACTIVE ENDPOINTS (MATCH BACKEND)
// =========================

// THIS is your main working endpoint
export const API_UPLOAD = `${API_BASE}/api/upload`;

//  NOT IMPLEMENTED IN BACKEND (kept but disabled)
/*
export const API_STATUS = `${API_BASE}/api/status`;
export const API_ANALYZE = `${API_BASE}/api/analyze`;
*/

// =========================
// FILE SYSTEM ENDPOINTS 
// =========================

export const API_LIST_FILES = `${API_BASE}/api/files/list-all`;

export const API_DOWNLOAD_FILE = (name) =>
  `${API_BASE}/api/files/download-local?name=${encodeURIComponent(name)}`;

export const API_DELETE_FILE = `${API_BASE}/api/files/delete`;

export const API_RENAME_FILE = `${API_BASE}/api/files/rename`;


/*
=========================
AZURE / LEGACY ENDPOINTS
(kept for compatibility — NOT deleted)
=========================
*/

// export const API_RENDER_STATUS = (fileId) =>
//   `${API_BASE}/render/status?file_id=${encodeURIComponent(fileId)}`;

// export const API_RENDER_START = (fileId) =>
//   `${API_BASE}/render/start?file_id=${encodeURIComponent(fileId)}`;

// export const API_FAST_EXTRACT_STATUS = (fileId) =>
//   `${API_BASE}/extract/fast/status?file_id=${encodeURIComponent(fileId)}`;

// export const API_FAST_EXTRACT_START = (fileId) =>
//   `${API_BASE}/extract/fast?file_id=${encodeURIComponent(fileId)}`;