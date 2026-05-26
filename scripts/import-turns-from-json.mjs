import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const INPUT_PATH = process.argv[2] || "turns-rows.json";
const prisma = new PrismaClient();
const SOURCE = "PM Dashboard Turns";
const LEGACY_CREATED_BY = "PM Dashboard import";
const CREATED_BY_PREFIX = "PM Dashboard import";

const KNOWN_ADDRESSES = new Map(
  [
    ["the smith (kop)", "580 S Goddard Blvd, King of Prussia, PA 19406 (The Smith)"],
    ["the smith", "580 S Goddard Blvd, King of Prussia, PA 19406 (The Smith)"],
    ["park square", "751 Vandenburg Rd, King of Prussia, PA 19406 (Park Square)"],
  ].map(([k, v]) => [normalizeKey(k), v]),
);

function text(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function asNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  const matches = raw.match(/-?\d+(?:\.\d+)?/g);
  if (!matches?.length) return null;
  const n = Number(matches[matches.length - 1]);
  return Number.isFinite(n) ? n : null;
}

function cents(value) {
  const n = asNumber(value);
  return n == null ? null : Math.round(n * 100);
}

function excelSerialToDate(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && value.includes("/")) {
    const [m, d, y] = value.split("/").map((part) => Number(part));
    if (m && d && y) {
      const fullYear = y < 100 ? 2000 + y : y;
      return new Date(Date.UTC(fullYear, m - 1, d));
    }
  }
  const serial = asNumber(value);
  if (serial == null || serial < 20000) return null;
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + serial * 86400000);
}

function isoDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function parsePercent(value) {
  const n = asNumber(value);
  if (n == null) return 0;
  const pct = n <= 1 ? n * 100 : n;
  return Math.min(100, Math.max(0, pct));
}

function parseUnitNumber(jobTitle) {
  const raw = text(jobTitle);
  const match =
    raw.match(/\bunit\s*#?\s*([a-z0-9 -]+)/i) ||
    raw.match(/\bapt(?:\.|artment)?\s*#?\s*([a-z0-9 -]+)/i) ||
    raw.match(/#\s*([a-z0-9 -]+)/i);
  if (!match) return null;
  return match[1].replace(/\bbuilding\b.*$/i, "").trim() || null;
}

function inferScope(jobTitle, description) {
  const haystack = `${jobTitle} ${description}`.toLowerCase();
  const isPaint = haystack.includes("paint");
  const isTouchUp = haystack.includes("touch up") || haystack.includes("touch-up");
  const isClean = haystack.includes("clean");
  return {
    fullClean: isClean,
    fullPaint: isPaint && !isTouchUp,
    touchUpPaint: isTouchUp ? 1 : 0,
    carpetCleaning: haystack.includes("carpet"),
    materialsAdditional: haystack.includes("material"),
  };
}

function employeeNameCandidates(name) {
  const normalized = normalizeKey(name);
  const parts = normalized.split(" ").filter(Boolean);
  const candidates = new Set([normalized]);
  if (parts.length > 1) candidates.add(`${parts[0]} ${parts[parts.length - 1]}`);
  return [...candidates];
}

function buildJobs(rows) {
  const jobs = [];
  const jobByKey = new Map();
  let current = null;
  let lastBuilding = "";

  for (const row of rows) {
    if (row.row <= 2) continue;

    const hasWorkerLine = text(row.E) && asNumber(row.F) != null && asNumber(row.G) != null;
    const hasJobIdentity = text(row.B) || text(row.C);
    const date = excelSerialToDate(row.A);

    if (text(row.B)) lastBuilding = text(row.B);

    if (hasJobIdentity && text(row.C)) {
      const buildingName = text(row.B) || lastBuilding;
      const jobTitle = text(row.C);
      const layout = text(row.D);
      const jobKey = [buildingName, jobTitle, layout].map(normalizeKey).join("||");
      current = jobByKey.get(jobKey) || {
        sourceRow: row.row,
        buildingName,
        jobTitle,
        layout,
        supervisor: text(row.H) || null,
        description: text(row.I),
        workDate: date,
        percentDone: parsePercent(row.J),
        contractValueCents: cents(row.N),
        invoiceNote: text(row.N),
        laborRows: [],
      };
      if (!jobByKey.has(jobKey)) {
        jobByKey.set(jobKey, current);
        jobs.push(current);
      }
    }

    if (hasWorkerLine && current) {
      const hours = asNumber(row.F);
      const hourlyRateCents = cents(row.G) ?? 0;
      const lineCostCents = cents(row.L) ?? Math.round((hours ?? 0) * hourlyRateCents);
      current.laborRows.push({
        sourceRow: row.row,
        workDate: date || current.workDate,
        workerName: text(row.E),
        hours,
        hourlyRateCents,
        lineCostCents,
        role: text(row.I) || current.description || null,
        supervisor: text(row.H) || current.supervisor,
      });
      if (!current.workDate && date) current.workDate = date;
      if (!current.supervisor && text(row.H)) current.supervisor = text(row.H);
      if (!current.description && text(row.I)) current.description = text(row.I);
      current.percentDone = Math.max(current.percentDone, parsePercent(row.J));
      current.contractValueCents ??= cents(row.N);
      if (!current.invoiceNote && text(row.N)) current.invoiceNote = text(row.N);
    }
  }

  return jobs.filter((job) => job.buildingName && job.jobTitle && job.laborRows.length > 0);
}

async function upsertBuilding(name) {
  const normalized = normalizeKey(name);
  const existing = await prisma.building.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) return { building: existing, action: "existing" };

  const building = await prisma.building.create({
    data: {
      name,
      address: KNOWN_ADDRESSES.get(normalized) || "Imported from PM Dashboard - address TBD",
    },
  });
  return { building, action: "created" };
}

async function findEmployeeMap() {
  const employees = await prisma.employee.findMany({ select: { id: true, firstName: true, lastName: true } });
  return new Map(employees.map((e) => [normalizeKey(`${e.firstName} ${e.lastName}`), e.id]));
}

async function upsertTurnoverRequest(job, buildingId) {
  const unitNumber = parseUnitNumber(job.jobTitle);
  const startDate = job.workDate;
  const scope = inferScope(job.jobTitle, job.description);
  const createdBy = `${CREATED_BY_PREFIX} | ${SOURCE} row ${job.sourceRow}`;

  const existing = await prisma.turnoverRequest.findFirst({
    where: {
      buildingId,
      createdBy,
    },
    orderBy: { createdAt: "asc" },
  });

  const data = {
    buildingId,
    requestType: "TURNOVER",
    unitNumber,
    startDate,
    endDate: startDate,
    priceCents: job.contractValueCents,
    status: job.percentDone >= 100 ? "COMPLETED" : "IN_PROGRESS",
    createdBy,
    ...scope,
  };

  if (existing) {
    return {
      request: await prisma.turnoverRequest.update({ where: { id: existing.id }, data }),
      action: "updated",
    };
  }

  return {
    request: await prisma.turnoverRequest.create({ data }),
    action: "created",
  };
}

async function upsertProject(job, building, request, employeeByName) {
  const sourceMarker = `${SOURCE} import | source row ${job.sourceRow}`;
  const jobTitle = `${building.name} - ${job.jobTitle}`;
  const actualHours = job.laborRows.reduce((sum, row) => sum + (row.hours ?? 0), 0);
  const actualLaborCents = job.laborRows.reduce((sum, row) => sum + row.lineCostCents, 0);
  const dateLabel = isoDate(job.workDate);
  const description = [
    `Property: ${building.name}`,
    `Building record: ${building.id}`,
    `Turnover request: ${request.id}`,
    job.layout ? `Layout: ${job.layout}` : null,
    job.description ? `Scope: ${job.description}` : null,
    job.invoiceNote && !/^\d+(?:\.\d+)?$/.test(job.invoiceNote) ? `Invoice note: ${job.invoiceNote}` : null,
    dateLabel ? `Dashboard date: ${dateLabel}` : null,
    sourceMarker,
  ]
    .filter(Boolean)
    .join("\n");

  const existing =
    (await prisma.project.findFirst({
      where: { description: { contains: sourceMarker } },
      orderBy: { createdAt: "asc" },
    })) ||
    (await prisma.project.findFirst({
      where: { jobTitle, segment: "JANITORIAL_TURNOVER_REQUESTS" },
      orderBy: { createdAt: "asc" },
    }));

  const data = {
    segment: "JANITORIAL_TURNOVER_REQUESTS",
    status: job.percentDone >= 100 ? "COMPLETE" : "ACTIVE",
    jobTitle,
    supervisor: job.supervisor || "UNASSIGNED PM",
    description,
    projectDate: job.workDate,
    projectEndDate: job.workDate,
    percentDone: job.percentDone,
    percentInvoiced: 0,
    contractValueCents: job.contractValueCents,
    actualLaborCents,
    actualHours,
  };

  const project = existing
    ? await prisma.project.update({ where: { id: existing.id }, data })
    : await prisma.project.create({ data });

  await prisma.laborEntry.deleteMany({
    where: { projectId: project.id, taskDescription: { contains: `${SOURCE} import` } },
  });

  await prisma.laborEntry.createMany({
    data: job.laborRows.map((row) => ({
      projectId: project.id,
      employeeId: employeeNameCandidates(row.workerName).map((name) => employeeByName.get(name)).find(Boolean) || null,
      workDate: row.workDate || job.workDate || new Date(),
      workerName: row.workerName,
      role: row.role,
      hours: row.hours ?? 0,
      hourlyRateCents: row.hourlyRateCents,
      taskDescription: [row.role || job.description || "Turnover work", `${sourceMarker}; labor row ${row.sourceRow}`].join(
        " | ",
      ),
    })),
  });

  return { project, action: existing ? "updated" : "created", actualHours, actualLaborCents };
}

async function main() {
  const rows = JSON.parse(readFileSync(INPUT_PATH, "utf8").replace(/^\uFEFF/, ""));
  const jobs = buildJobs(rows);
  const employeeByName = await findEmployeeMap();
  const results = [];

  await prisma.turnoverRequest.deleteMany({ where: { createdBy: LEGACY_CREATED_BY } });

  for (const job of jobs) {
    const { building, action: buildingAction } = await upsertBuilding(job.buildingName);
    const { request, action: requestAction } = await upsertTurnoverRequest(job, building.id);
    const projectResult = await upsertProject(job, building, request, employeeByName);

    results.push({
      sourceRow: job.sourceRow,
      building: building.name,
      buildingAction,
      requestAction,
      projectAction: projectResult.action,
      projectTitle: projectResult.project.jobTitle,
      laborRows: job.laborRows.length,
      actualHours: projectResult.actualHours,
      actualLabor: projectResult.actualLaborCents / 100,
    });
  }

  const report = {
    source: SOURCE,
    importedJobs: results.length,
    buildingsCreated: results.filter((r) => r.buildingAction === "created").length,
    turnoverRequestsCreated: results.filter((r) => r.requestAction === "created").length,
    projectsCreated: results.filter((r) => r.projectAction === "created").length,
    projectsUpdated: results.filter((r) => r.projectAction === "updated").length,
    laborRows: results.reduce((sum, r) => sum + r.laborRows, 0),
    actualHours: results.reduce((sum, r) => sum + r.actualHours, 0),
    actualLabor: results.reduce((sum, r) => sum + r.actualLabor, 0),
    details: results,
  };

  writeFileSync("turns-import-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
