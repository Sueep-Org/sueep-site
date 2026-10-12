/** Limits for files attached to a project message. Safe to import on the client. */

/** Total across all files on one email. Request bodies over ~4.5 MB fail on Vercel, same cap as other ERP uploads. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

/** File types that can run on the recipient's computer. Mail providers reject these anyway. */
const BLOCKED = /\.(exe|bat|cmd|com|scr|msi|js|jse|vbs|vbe|wsf|wsh|ps1|jar|lnk|hta|cpl|reg|dll|apk|app|dmg)$/i;

/** An error message for this set of files, or null when they're fine. */
export function attachmentProblem(files: { name: string; size: number }[]): string | null {
  if (files.length > MAX_ATTACHMENTS) return `Attach ${MAX_ATTACHMENTS} files at most`;
  const blocked = files.find((f) => BLOCKED.test(f.name));
  if (blocked) return `"${blocked.name}" is a file type that can't be emailed`;
  if (files.some((f) => f.size === 0)) return "One of the files is empty";
  if (files.reduce((n, f) => n + f.size, 0) > MAX_ATTACHMENT_BYTES) return "The attachments are over 4 MB in total";
  return null;
}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
