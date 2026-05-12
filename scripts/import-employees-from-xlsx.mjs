import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const XLSX_PATH = process.argv[2];
if (!XLSX_PATH) {
  console.error('Usage: node scripts/import-employees-from-xlsx.mjs "/absolute/path/to/file.xlsx"');
  process.exit(1);
}

const prisma = new PrismaClient();
const SOURCE_TAG = "Imported from employee spreadsheet";

const dumpPath = "/tmp/sueep-employees-xlsx-dump.json";
execSync(`npx -y xlsx-cli --all -z "${XLSX_PATH}" -N 0 > "${dumpPath}"`, { stdio: "ignore" });

const workbook = JSON.parse(readFileSync(dumpPath, "utf8"));
const sheetName = workbook?.Props?.SheetNames?.[0];
const rows = workbook?.Sheets?.[sheetName]?.["!data"] ?? [];

function cellValue(row, i) {
  const v = row?.[i]?.v;
  if (v == null) return "";
  return String(v).trim();
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseHourlyPayCents(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function isLikelyEmail(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function normalizedName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function splitName(fullName) {
  const clean = String(fullName || "").replace(/\s+/g, " ").trim();
  if (!clean) return { firstName: "", lastName: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "-" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function parseDocCell(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  const text = value.toLowerCase();
  const negative = ["incomplete", "pending", "not completed", "missing", "not approved", "no"];
  const positive = ["approved", "complete", "completed", "verified", "yes", "osha 10", "osha 30", "pass"];

  const isNegative = negative.some((w) => text.includes(w));
  const isPositive = positive.some((w) => text.includes(w));

  return {
    raw: value,
    isVerified: isPositive && !isNegative,
  };
}

function isHeaderOrTitleRow(workerName) {
  const v = normalizedName(workerName);
  return !v || v === "worker name" || v === "worker verification";
}

function buildNotes(entry) {
  const parts = [];
  if (entry.rawEmail && !entry.email) parts.push(`Raw Email Value: ${entry.rawEmail}`);
  if (entry.rawPhone && !entry.phone) parts.push(`Raw Phone Value: ${entry.rawPhone}`);
  parts.push(`Source Row: ${entry.rowNumber}`);
  parts.push(SOURCE_TAG);
  return parts.join(" | ");
}

const parsed = [];
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const workerName = cellValue(row, 0);
  if (isHeaderOrTitleRow(workerName)) continue;

  const role = cellValue(row, 1) || null;
  const hourlyPay = cellValue(row, 2) || null;
  const project = cellValue(row, 3) || null;
  const verifiedIdRaw = cellValue(row, 4);
  const backgroundRaw = cellValue(row, 5);
  const oshaRaw = cellValue(row, 6);
  const hireDate = parseDate(cellValue(row, 7));
  const rawPhone = cellValue(row, 8);
  const rawEmail = cellValue(row, 9);

  const email = isLikelyEmail(rawEmail) ? rawEmail.toLowerCase() : null;
  const phone = /\d/.test(rawPhone) ? rawPhone : null;

  const docs = [
    { type: "VERIFIED_ID", title: "Verified ID", parsed: parseDocCell(verifiedIdRaw) },
    { type: "BACKGROUND_CHECK", title: "Background Check", parsed: parseDocCell(backgroundRaw) },
    { type: "OSHA_CERT", title: "OSHA Cert", parsed: parseDocCell(oshaRaw) },
  ].filter((d) => d.parsed);

  parsed.push({
    rowNumber: i + 1,
    workerName: workerName.replace(/\s+/g, " ").trim(),
    role,
    hourlyPay,
    hourlyPayCents: parseHourlyPayCents(hourlyPay),
    project,
    hireDate,
    email,
    phone,
    rawEmail: rawEmail || null,
    rawPhone: rawPhone || null,
    docs,
  });
}

// Merge duplicate spreadsheet rows by email first, then by normalized full name.
const mergedByKey = new Map();
for (const row of parsed) {
  const key = row.email ? `email:${row.email}` : `name:${normalizedName(row.workerName)}`;
  const existing = mergedByKey.get(key);
  if (!existing) {
    mergedByKey.set(key, { ...row });
    continue;
  }

  existing.role = existing.role || row.role;
  existing.hourlyPay = existing.hourlyPay || row.hourlyPay;
  existing.hourlyPayCents = existing.hourlyPayCents ?? row.hourlyPayCents;
  existing.project = existing.project || row.project;
  existing.hireDate = existing.hireDate || row.hireDate;
  existing.phone = existing.phone || row.phone;
  existing.email = existing.email || row.email;
  existing.rawEmail = existing.rawEmail || row.rawEmail;
  existing.rawPhone = existing.rawPhone || row.rawPhone;
  existing.rowNumber = Math.min(existing.rowNumber, row.rowNumber);

  const docByType = new Map(existing.docs.map((d) => [d.type, d]));
  for (const d of row.docs) {
    if (!docByType.has(d.type)) docByType.set(d.type, d);
  }
  existing.docs = [...docByType.values()];
}

const merged = [...mergedByKey.values()].filter((r) => normalizedName(r.workerName));

async function main() {
  const existing = await prisma.employee.findMany({
    select: { id: true, firstName: true, lastName: true, email: true, notes: true },
  });
  const byEmail = new Map(
    existing.filter((e) => e.email).map((e) => [String(e.email).toLowerCase(), e]),
  );
  const byName = new Map(existing.map((e) => [normalizedName(`${e.firstName} ${e.lastName}`), e]));

  const reportRows = [];
  let created = 0;
  let updated = 0;
  let docsCreated = 0;

  for (const entry of merged) {
    const { firstName, lastName } = splitName(entry.workerName);
    if (!firstName) continue;

    const notes = buildNotes(entry);
    const existingEmployee = (entry.email ? byEmail.get(entry.email) : null) || byName.get(normalizedName(entry.workerName));

    let employee;
    if (!existingEmployee) {
      employee = await prisma.employee.create({
        data: {
          firstName,
          lastName,
          email: entry.email,
          phone: entry.phone,
          role: entry.role,
          hourlyPayCents: entry.hourlyPayCents,
          defaultProject: entry.project,
          status: "ACTIVE",
          hireDate: entry.hireDate,
          notes,
        },
      });
      created += 1;
    } else {
      employee = await prisma.employee.update({
        where: { id: existingEmployee.id },
        data: {
          firstName: firstName || existingEmployee.firstName,
          lastName: lastName || existingEmployee.lastName,
          email: entry.email ?? existingEmployee.email,
          phone: entry.phone ?? undefined,
          role: entry.role ?? undefined,
          hourlyPayCents: entry.hourlyPayCents ?? undefined,
          defaultProject: entry.project ?? undefined,
          hireDate: entry.hireDate ?? undefined,
          notes,
        },
      });
      updated += 1;
    }

    await prisma.employeeDocument.deleteMany({
      where: {
        employeeId: employee.id,
        documentType: { in: ["VERIFIED_ID", "BACKGROUND_CHECK", "OSHA_CERT"] },
        notes: { contains: SOURCE_TAG },
      },
    });

    if (entry.docs.length > 0) {
      await prisma.employeeDocument.createMany({
        data: entry.docs.map((d) => ({
          employeeId: employee.id,
          documentType: d.type,
          title: d.title,
          isVerified: Boolean(d.parsed.isVerified),
          notes: `${SOURCE_TAG} | Spreadsheet Value: ${d.parsed.raw}`,
        })),
      });
      docsCreated += entry.docs.length;
    }

    reportRows.push({
      name: `${employee.firstName} ${employee.lastName}`,
      action: existingEmployee ? "updated" : "created",
      row: entry.rowNumber,
      email: employee.email,
      docs: entry.docs.length,
    });
  }

  const report = {
    sheetName,
    parsedRows: parsed.length,
    importedEmployees: reportRows.length,
    created,
    updated,
    docsCreated,
    details: reportRows,
  };
  writeFileSync("/tmp/sueep-employee-import-report.json", JSON.stringify(report, null, 2));
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