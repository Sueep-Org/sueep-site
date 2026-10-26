import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeePayroll } from "@/lib/erpAuth";
import { HEALTH_SHARE_SETTING_KEY, parseHealthSharePct } from "@/lib/erp/healthCost";

/**
 * People on the company health plan (see lib/erp/healthCost.ts). Anyone who
 * can see Payroll can view; only an Admin can change anything.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(v: unknown): Date | null {
  const s = String(v ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

function parseCents(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n * 100) : null;
}

async function adminOnly() {
  const auth = await getErpAuth();
  return auth?.role === "ADMIN" ? null : NextResponse.json({ error: "Only an Admin can change health insurance" }, { status: 403 });
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function employeeIdOrNull(v: unknown): Promise<string | null | undefined> {
  if (v == null || v === "") return null;
  const found = await prisma.employee.findUnique({ where: { id: String(v) }, select: { id: true } });
  return found ? found.id : undefined;
}

export async function GET() {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [rows, share] = await Promise.all([
    prisma.healthCoverage.findMany({
      orderBy: [{ personName: "asc" }, { startDate: "asc" }],
      include: { employee: { select: { firstName: true, lastName: true } } },
    }),
    prisma.appSetting.findUnique({ where: { key: HEALTH_SHARE_SETTING_KEY } }),
  ]);
  return NextResponse.json({
    coverages: rows.map((r) => ({
      id: r.id,
      personName: r.personName,
      employeeId: r.employeeId,
      employeeName: r.employee ? `${r.employee.firstName} ${r.employee.lastName}`.trim() : null,
      monthlyPremiumCents: r.monthlyPremiumCents,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
    })),
    sharePct: parseHealthSharePct(share?.value),
    canEdit: auth.role === "ADMIN",
  });
}

/** Add a person: { personName, employeeId?, monthlyPremium (dollars), startDate } */
export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const b = await readBody(req);
  if (!b) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const personName = String(b.personName ?? "").trim();
  if (!personName) return NextResponse.json({ error: "Enter a name" }, { status: 400 });
  const cents = parseCents(b.monthlyPremium);
  if (cents == null) return NextResponse.json({ error: "Enter the monthly premium" }, { status: 400 });
  const startDate = parseDay(b.startDate);
  if (!startDate) return NextResponse.json({ error: "Enter the start date" }, { status: 400 });
  const employeeId = await employeeIdOrNull(b.employeeId);
  if (employeeId === undefined) return NextResponse.json({ error: "Employee not found" }, { status: 400 });
  const row = await prisma.healthCoverage.create({ data: { personName, employeeId, monthlyPremiumCents: cents, startDate } });
  return NextResponse.json({ id: row.id });
}

/**
 * Edit a row. Name, employee and end date change in place. A new price
 * ({ newPremium, changeFrom }) ends this row the day before changeFrom and
 * starts a new one, so earlier months keep the old price.
 */
export async function PATCH(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const b = await readBody(req);
  if (!b) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const existing = await prisma.healthCoverage.findUnique({ where: { id: String(b.id ?? "") } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { personName?: string; employeeId?: string | null; endDate?: Date | null } = {};
  if (b.personName !== undefined) {
    const name = String(b.personName).trim();
    if (!name) return NextResponse.json({ error: "Enter a name" }, { status: 400 });
    data.personName = name;
  }
  if (b.employeeId !== undefined) {
    const employeeId = await employeeIdOrNull(b.employeeId);
    if (employeeId === undefined) return NextResponse.json({ error: "Employee not found" }, { status: 400 });
    data.employeeId = employeeId;
  }
  if (b.endDate !== undefined) {
    const endDate = b.endDate ? parseDay(b.endDate) : null;
    if (b.endDate && !endDate) return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
    if (endDate && endDate < existing.startDate) return NextResponse.json({ error: "The end date is before coverage started" }, { status: 400 });
    data.endDate = endDate;
  }

  if (b.newPremium !== undefined) {
    const cents = parseCents(b.newPremium);
    if (cents == null) return NextResponse.json({ error: "Enter the new monthly premium" }, { status: 400 });
    const changeFrom = parseDay(b.changeFrom);
    if (!changeFrom) return NextResponse.json({ error: "Enter when the new price starts" }, { status: 400 });
    if (changeFrom <= existing.startDate) {
      // Starts on or before this row: just correct the price.
      await prisma.healthCoverage.update({ where: { id: existing.id }, data: { ...data, monthlyPremiumCents: cents } });
      return NextResponse.json({ ok: true });
    }
    if (existing.endDate && changeFrom > existing.endDate) return NextResponse.json({ error: "That's after this coverage ended" }, { status: 400 });
    await prisma.$transaction([
      prisma.healthCoverage.update({ where: { id: existing.id }, data: { ...data, endDate: new Date(changeFrom.getTime() - DAY_MS) } }),
      prisma.healthCoverage.create({
        data: {
          personName: data.personName ?? existing.personName,
          employeeId: data.employeeId !== undefined ? data.employeeId : existing.employeeId,
          monthlyPremiumCents: cents,
          startDate: changeFrom,
          endDate: data.endDate !== undefined ? data.endDate : existing.endDate,
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  await prisma.healthCoverage.update({ where: { id: existing.id }, data });
  return NextResponse.json({ ok: true });
}

/** Remove a row added by mistake (someone who left the plan gets an end date instead). */
export async function DELETE(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await prisma.healthCoverage.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}

/** Sueep's share of every premium: { sharePct } */
export async function PUT(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const b = await readBody(req);
  const pct = Number(b?.sharePct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ error: "Share must be 0 to 100%" }, { status: 400 });
  await prisma.appSetting.upsert({
    where: { key: HEALTH_SHARE_SETTING_KEY },
    update: { value: String(pct) },
    create: { key: HEALTH_SHARE_SETTING_KEY, value: String(pct) },
  });
  return NextResponse.json({ sharePct: pct });
}
