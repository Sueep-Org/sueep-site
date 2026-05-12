import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const XLSX_PATH = process.argv[2];
if (!XLSX_PATH) {
  console.error("Usage: node scripts/import-projects-from-xlsx.mjs \"/absolute/path/to/file.xlsx\"");
  process.exit(1);
}

const prisma = new PrismaClient();

const dumpPath = "/tmp/sueep-xlsx-dump.json";
execSync(`npx -y xlsx-cli --all -z "${XLSX_PATH}" -N 0 > "${dumpPath}"`, {
  stdio: "ignore",
});
const workbook = JSON.parse(readFileSync(dumpPath, "utf8"));
const sheetName = workbook?.Props?.SheetNames?.[0];
const rows = workbook?.Sheets?.[sheetName]?.["!data"] ?? [];

function asNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function excelSerialToDate(serial) {
  if (serial instanceof Date) return serial;
  if (typeof serial === "string") {
    const d = new Date(serial);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const n = asNumber(serial);
  if (n == null) return null;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + n * 86400000);
}

function centsFromDollars(v) {
  const n = asNumber(v);
  if (n == null) return null;
  return Math.round(n * 100);
}

function normTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-–—]/g, "-")
    .trim();
}

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function workerNameCandidates(name) {
  const normalized = normName(name);
  const out = new Set([normalized]);
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    out.add(`${parts[0]} ${parts[parts.length - 1]}`);
    out.add(parts[0]);
    out.add(parts[parts.length - 1]);
  }
  return [...out];
}

function colorToStatus(rgb) {
  if (rgb === "CCCCCC") return { status: "COMPLETE", upcoming: false };
  if (rgb === "B4A7D6") return { status: "ACTIVE", upcoming: true };
  return { status: "ACTIVE", upcoming: false };
}

function inferSegment(title, description, existing) {
  if (existing) return existing;
  const t = `${title || ""} ${description || ""}`.toLowerCase();
  if (t.includes("change order")) return "CHANGE_ORDER";
  if (t.includes("paint")) return "COMMERCIAL_PAINTING";
  return "COMMERCIAL_CLEANING";
}

function isSummaryRow(r) {
  const c0 = r?.[0];
  if (!c0 || c0.t !== "s" || !c0.v) return false;
  const title = String(c0.v).trim();
  if (!title) return false;
  if (title === "DATE" || title === "PROJECT DETAILS" || title === "sueep") return false;
  return true;
}

const summaryIndexes = [];
for (let i = 0; i < rows.length; i++) {
  if (isSummaryRow(rows[i])) summaryIndexes.push(i);
}

const blocks = summaryIndexes.map((idx, i) => {
  const row = rows[idx];
  const end = i + 1 < summaryIndexes.length ? summaryIndexes[i + 1] : rows.length;
  const title = String(row?.[0]?.v || "").trim();
  const color = row?.[0]?.s?.fgColor?.rgb || "";
  const supervisor = String(row?.[5]?.v || "").trim() || null;
  const description = String(row?.[6]?.v || "").trim() || null;
  const percentDoneRaw = asNumber(row?.[7]?.v);
  const percentDone = percentDoneRaw != null ? Math.min(100, Math.max(0, percentDoneRaw * 100)) : 0;

  const detailRows = [];
  for (let r = idx + 1; r < end; r++) {
    const line = rows[r];
    const date = excelSerialToDate(line?.[0]?.v);
    const workerName = String(line?.[2]?.v || "").trim();
    if (!date || !workerName) continue;
    const hours = asNumber(line?.[3]?.v);
    const rate = asNumber(line?.[4]?.v);
    if (hours == null || rate == null) continue;
    detailRows.push({
      workDate: date,
      workerName,
      role: String(line?.[1]?.v || "").trim() || null,
      hours,
      hourlyRateCents: Math.round(rate * 100),
      taskDescription: String(line?.[6]?.v || "").trim() || null,
    });
  }

  return {
    row: idx + 1,
    title,
    color,
    supervisor,
    description,
    percentDone,
    contractValueCents: centsFromDollars(row?.[8]?.v),
    estMaterialCents: centsFromDollars(row?.[9]?.v),
    estTravelCents: centsFromDollars(row?.[10]?.v),
    estLaborCents: centsFromDollars(row?.[11]?.v),
    actualLaborCents: centsFromDollars(row?.[12]?.v),
    actualMaterialCents: centsFromDollars(row?.[13]?.v),
    estHours: asNumber(row?.[14]?.v),
    actualHours: asNumber(row?.[15]?.v),
    detailRows,
  };
});

// Keep the latest occurrence per title (lower in sheet wins).
const latestByTitle = new Map();
for (const b of blocks) latestByTitle.set(normTitle(b.title), b);
const selected = [...latestByTitle.values()];

async function main() {
  const existingProjects = await prisma.project.findMany({
    select: { id: true, jobTitle: true, segment: true, projectDate: true },
  });
  const existingByTitle = new Map(existingProjects.map((p) => [normTitle(p.jobTitle), p]));
  const employees = await prisma.employee.findMany({ select: { id: true, firstName: true, lastName: true } });
  const employeeByNormName = new Map(
    employees.map((e) => [normName(`${e.firstName} ${e.lastName}`), e.id]),
  );

  const results = [];
  for (const p of selected) {
    const existing = existingByTitle.get(normTitle(p.title));
    const { status, upcoming } = colorToStatus(p.color);

    let projectDate = existing?.projectDate ?? null;
    const firstLaborDate = p.detailRows.length > 0 ? p.detailRows[0].workDate : null;
    if (!projectDate && firstLaborDate) projectDate = firstLaborDate;
    if (upcoming) {
      const now = new Date();
      const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      base.setDate(base.getDate() + 14);
      if (!projectDate || projectDate <= now) projectDate = base;
    }

    const data = {
      jobTitle: p.title,
      supervisor: p.supervisor || "UNASSIGNED PM",
      description: p.description,
      percentDone: p.percentDone,
      status,
      segment: inferSegment(p.title, p.description, existing?.segment),
      projectDate,
      contractValueCents: p.contractValueCents,
      estMaterialCents: p.estMaterialCents,
      estTravelCents: p.estTravelCents,
      estLaborCents: p.estLaborCents,
      actualLaborCents: p.actualLaborCents,
      actualMaterialCents: p.actualMaterialCents,
      estHours: p.estHours,
      actualHours: p.actualHours,
    };

    const project = existing
      ? await prisma.project.update({ where: { id: existing.id }, data })
      : await prisma.project.create({ data });

    await prisma.laborEntry.deleteMany({ where: { projectId: project.id } });
    if (p.detailRows.length > 0) {
      await prisma.laborEntry.createMany({
        data: p.detailRows.map((d) => ({
          employeeId: workerNameCandidates(d.workerName).map((k) => employeeByNormName.get(k)).find(Boolean) || null,
          projectId: project.id,
          workDate: d.workDate,
          workerName: d.workerName,
          role: d.role,
          hours: d.hours,
          hourlyRateCents: d.hourlyRateCents,
          taskDescription: d.taskDescription,
        })),
      });
    }

    results.push({
      row: p.row,
      title: p.title,
      action: existing ? "updated" : "created",
      status,
      laborRows: p.detailRows.length,
    });
  }

  const report = {
    importedProjects: results.length,
    created: results.filter((r) => r.action === "created").length,
    updated: results.filter((r) => r.action === "updated").length,
    details: results,
  };
  writeFileSync("/tmp/sueep-project-import-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });