import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { inputToCents } from "@/lib/erp/money";

const DRAWINGS_VALUES = ["YES", "NO", "ASKED"];

function parseOptionalDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const employeeId = String(body.employeeId || "").trim();
  const company = String(body.company || "").trim();
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  if (!company) return NextResponse.json({ error: "company is required" }, { status: 400 });

  const drawings = body.drawings ? String(body.drawings).toUpperCase() : null;
  if (drawings && !DRAWINGS_VALUES.includes(drawings)) {
    return NextResponse.json({ error: "drawings must be YES, NO, or ASKED" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  try {
    const created = await prisma.salesBidEntry.create({
      data: {
        employeeId,
        company,
        date: parseOptionalDate(body.date) ?? null,
        projectStartDate: parseOptionalDate(body.projectStartDate) ?? null,
        deal: body.deal ? String(body.deal).trim() : null,
        description: body.description ? String(body.description).trim() : null,
        drawings,
        payoutCents: inputToCents(body.payout),
        sent: Boolean(body.sent),
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    return NextResponse.json(created);
  } catch (e) {
    console.error("POST /api/erp/sales-bids", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
