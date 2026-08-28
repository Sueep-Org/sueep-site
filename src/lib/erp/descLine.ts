/**
 * Pulls a single "Key: value" line out of a freeform Project/description
 * blob — e.g. a legacy "SUEEP PM: David Rodriguez" line predating the
 * dedicated Project.supervisor field. Pure string logic, no dependencies,
 * so both server code and "use client" components can import it directly.
 */
export function getDescLine(description: string | null, key: string): string {
  if (!description) return "";
  const prefix = `${key}:`;
  return (
    description
      .split(/\r?\n/)
      .find((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()))
      ?.replace(new RegExp(`^${key}:\\s*`, "i"), "")
      .trim() ?? ""
  );
}
