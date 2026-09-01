// =========================
// BACKEND (via the sueep-site proxy)
// =========================

// Used to call aiestimator-api directly, cross-origin, with no auth on the
// request at all (see ESTIMATOR_STORAGE_FIX_PLAN.md in sueep-site). Now a
// same-origin path into sueep-site's own /api/estimator/proxy/[...path]
// route, which forwards to the real backend server-side, attaching the
// caller's company identity there instead of trusting anything the browser
// sends. Which actual backend it forwards to (local vs production) is a
// server-side env var now (ESTIMATOR_API_BASE), not something this file
// needs to guess from the hostname anymore.
export const API_BASE = "/api/estimator/proxy";

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