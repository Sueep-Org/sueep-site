/**
 * One-off (2026-11): shrink the turnover checklist photos saved full size
 * from phones (UnitChecklistPhoto) the same way new uploads are now
 * (photoProcessing.ts: upright, 1600px JPEG, EXIF and GPS dropped) and add
 * the 320px preview. Photo ids don't change, so checklist links keep working.
 *
 * Dry run by default: reads every photo, works out the new sizes, writes
 * nothing. --apply needs --backup-dir: each original is saved there (bytes
 * plus a line in manifest.jsonl) before its row changes. --restore puts the
 * originals from a backup folder back.
 *
 *   npx tsx --env-file=.env.local scripts/shrink-checklist-photos.ts
 *   npx tsx --env-file=.env.local scripts/shrink-checklist-photos.ts --apply --backup-dir=../checklist-photo-backup
 *   npx tsx --env-file=.env.local scripts/shrink-checklist-photos.ts --restore --backup-dir=../checklist-photo-backup
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { jpegName, processPhoto } from "@/lib/erp/photoProcessing";

const APPLY = process.argv.includes("--apply");
const RESTORE = process.argv.includes("--restore");
const backupArg = process.argv.find((a) => a.startsWith("--backup-dir="));
const BACKUP_DIR = backupArg ? resolve(backupArg.slice("--backup-dir=".length)) : null;

type Entry = { id: string; filename: string; mimeType: string; size: number; file: string };

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

function dbHost(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(DATABASE_URL not set)";
  }
}

async function shrink() {
  if (APPLY && !BACKUP_DIR) throw new Error("--apply needs --backup-dir=<folder> so the originals are saved first");
  const manifest = BACKUP_DIR ? join(BACKUP_DIR, "manifest.jsonl") : null;
  if (APPLY && BACKUP_DIR) mkdirSync(BACKUP_DIR, { recursive: true });

  // Ids only; each photo's bytes are read one at a time below
  const ids = await prisma.unitChecklistPhoto.findMany({ where: { thumb: null }, select: { id: true }, orderBy: { createdAt: "asc" } });
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} on ${dbHost()}: ${ids.length} photos with no preview yet\n`);

  let before = 0;
  let after = 0;
  let changed = 0;
  let thumbOnly = 0;
  const failed: string[] = [];
  for (const [i, { id }] of ids.entries()) {
    const row = await prisma.unitChecklistPhoto.findUnique({ where: { id }, select: { id: true, data: true, filename: true, mimeType: true, size: true } });
    if (!row) continue;
    const original = Buffer.from(row.data);
    let img;
    try {
      img = await processPhoto(original);
    } catch (e) {
      failed.push(`${id} (${row.filename}, ${row.mimeType}): ${e instanceof Error ? e.message : String(e)}`);
      before += original.length;
      after += original.length;
      continue;
    }
    // Keep the original bytes if re-encoding wouldn't make it smaller; it still gets a preview
    const smaller = img.full.length < original.length;
    const newSize = smaller ? img.full.length : original.length;
    before += original.length;
    after += newSize;
    if (smaller) changed++;
    else thumbOnly++;
    console.log(`${String(i + 1).padStart(3)}/${ids.length} ${id} ${kb(original.length)} -> ${kb(newSize)}${smaller ? "" : " (kept, preview only)"} ${img.width}x${img.height}`);

    if (!APPLY) continue;
    const file = `${id}.bin`;
    const path = join(BACKUP_DIR!, file);
    if (!existsSync(path)) {
      writeFileSync(path, original);
      const entry: Entry = { id, filename: row.filename, mimeType: row.mimeType, size: row.size, file };
      appendFileSync(manifest!, `${JSON.stringify(entry)}\n`);
    }
    // Guarded on the bytes not changing since they were read
    const done = await prisma.unitChecklistPhoto.updateMany({
      where: { id, thumb: null, size: row.size },
      data: smaller
        ? { data: img.full, thumb: img.thumb, mimeType: "image/jpeg", filename: jpegName(row.filename), size: img.full.length }
        : { thumb: img.thumb },
    });
    if (done.count !== 1) failed.push(`${id}: changed while running, skipped`);
  }

  console.log(`\nTotal ${mb(before)} -> ${mb(after)} (${changed} shrunk, ${thumbOnly} preview only, ${failed.length} skipped)`);
  for (const f of failed) console.log(`  skipped ${f}`);
  if (APPLY) console.log(`Originals saved in ${BACKUP_DIR}`);
  else console.log("Nothing written. Pass --apply --backup-dir=<folder> to write.");
}

async function restore() {
  if (!BACKUP_DIR) throw new Error("--restore needs --backup-dir=<folder>");
  const lines = readFileSync(join(BACKUP_DIR, "manifest.jsonl"), "utf8").split("\n").filter(Boolean);
  console.log(`RESTORE on ${dbHost()}: ${lines.length} originals from ${BACKUP_DIR}\n`);
  let restored = 0;
  for (const line of lines) {
    const e = JSON.parse(line) as Entry;
    const data = readFileSync(join(BACKUP_DIR, e.file));
    if (data.length !== e.size) console.log(`  note ${e.id}: backup is ${data.length} bytes, row said ${e.size}`);
    const done = await prisma.unitChecklistPhoto.updateMany({
      where: { id: e.id },
      data: { data, thumb: null, mimeType: e.mimeType, filename: e.filename, size: e.size },
    });
    if (done.count === 1) restored++;
    else console.log(`  ${e.id}: photo no longer exists, skipped`);
  }
  console.log(`Restored ${restored} of ${lines.length}`);
}

(RESTORE ? restore() : shrink())
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
