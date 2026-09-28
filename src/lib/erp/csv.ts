/** Client-side CSV helpers shared by the ERP's "Download CSV" buttons. */

export type CsvColumn<T> = { header: string; get: (row: T) => string | number | null | undefined };

function escapeCell(value: string | number | null | undefined): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/** Header row + one line per row, plus any extra trailing rows (e.g. totals). */
export function buildCsv<T>(columns: CsvColumn<T>[], rows: T[], trailingRows: (string | number)[][] = []): string {
  const lines = [
    columns.map((c) => escapeCell(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => escapeCell(c.get(r))).join(",")),
    ...trailingRows.map((cells) => cells.map(escapeCell).join(",")),
  ];
  return lines.join("\r\n");
}

/** Triggers a browser download. Leading BOM so Excel reads accented names as UTF-8. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** "Maria Lopez" -> "maria-lopez", safe for a filename. */
export function slugForFilename(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // "María" -> "Maria"
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "export"
  );
}
