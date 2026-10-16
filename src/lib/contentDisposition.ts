/**
 * Content-Disposition header for a user-supplied file name.
 *
 * Header values can only hold characters up to U+00FF, so a name like
 * "COMPAÑIA.pdf" saved by a Mac or iPhone (where "Ñ" is "N" plus a separate
 * combining tilde, U+0303) made the response throw and the file would not
 * open at all. The plain `filename` gets an ASCII-only fallback and the real
 * name goes in `filename*` (RFC 6266), which browsers prefer.
 */
export function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const name = filename.normalize("NFC").replace(/[\r\n]/g, "").trim() || "document";
  const fallback =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "")
      .trim() || "document";
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
