import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TIME_OFF_TYPES, parseTimeOffDate, findOverlappingContractorTimeOff, overlapErrorMessage } from "@/lib/erp/timeOff";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const contractor = await prisma.contractor.findUnique({ where: { id }, select: { id: true } });
  if (!contractor) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const startDate = parseTimeOffDate(body.startDate);
  const endDate = parseTimeOffDate(body.endDate);
  if (!startDate) return NextResponse.json({ error: "startDate is required" }, { status: 400 });
  if (!endDate) return NextResponse.json({ error: "endDate is required" }, { status: 400 });
  if (endDate.getTime() < startDate.getTime()) {
    return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
  }

  const typeRaw = String(body.type || "VACATION").toUpperCase();
  const type = TIME_OFF_TYPES.includes(typeRaw as (typeof TIME_OFF_TYPES)[number]) ? typeRaw : "VACATION";

  try {
    const overlap = await findOverlappingContractorTimeOff(id, startDate, endDate);
    if (overlap) {
      return NextResponse.json({ error: overlapErrorMessage(overlap) }, { status: 409 });
    }

    const row = await prisma.contractorTimeOff.create({
      data: {
        contractorId: id,
        startDate,
        endDate,
        type,
        notes: body.notes ? String(body.notes).trim() : null,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error("POST /api/erp/contractors/[id]/time-off", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
