import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { inputToCents } from "@/lib/erp/money";
import { parseBillingDay } from "@/lib/erp/recurringContracts";

export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const buildingId = String(body.buildingId ?? "").trim();
  // Alternative to buildingId: create the client's building in the same
  // request, so a new janitorial client doesn't need a trip to Buildings first.
  const newBuilding =
    body.newBuilding && typeof body.newBuilding === "object" ? (body.newBuilding as Record<string, unknown>) : null;
  const monthlyRateCents = inputToCents(body.monthlyRate);
  const billingDayOfMonth = parseBillingDay(body.billingDayOfMonth);
  const startDate = new Date(String(body.startDate ?? ""));
  const commissionEmployeeId = body.commissionEmployeeId ? String(body.commissionEmployeeId).trim() : null;
  const serviceAreas = body.serviceAreas ? String(body.serviceAreas).trim() : null;
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!buildingId && !newBuilding) return NextResponse.json({ error: "Pick a building or add a new one" }, { status: 400 });
  if (monthlyRateCents === null || monthlyRateCents <= 0) {
    return NextResponse.json({ error: "Monthly rate must be a positive number" }, { status: 400 });
  }
  if (billingDayOfMonth === null) {
    return NextResponse.json({ error: "Billing day must be between 1 and 28" }, { status: 400 });
  }
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
  }

  const contractData = { monthlyRateCents, billingDayOfMonth, startDate, commissionEmployeeId, serviceAreas, notes };

  if (newBuilding) {
    const optional = (v: unknown) => (v != null && String(v).trim() !== "" ? String(v).trim() : null);
    const name = String(newBuilding.name ?? "").trim();
    const address = String(newBuilding.address ?? "").trim();
    if (!name || !address) {
      return NextResponse.json({ error: "New building needs a name and address" }, { status: 400 });
    }
    const existing = await prisma.building.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: `A building named "${name}" already exists, pick it from the list instead` }, { status: 409 });
    }

    const contract = await prisma.$transaction(async (tx) => {
      const building = await tx.building.create({
        data: {
          name,
          address,
          pmName: optional(newBuilding.pmName),
          pmEmail: optional(newBuilding.pmEmail),
          pmPhone: optional(newBuilding.pmPhone),
        },
      });
      return tx.recurringContract.create({ data: { buildingId: building.id, ...contractData } });
    });
    return NextResponse.json(contract);
  }

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    select: { id: true, recurringContract: { select: { id: true } } },
  });
  if (!building) return NextResponse.json({ error: "Building not found" }, { status: 404 });
  if (building.recurringContract) {
    return NextResponse.json({ error: "This building already has a contract" }, { status: 409 });
  }

  const contract = await prisma.recurringContract.create({ data: { buildingId, ...contractData } });
  return NextResponse.json(contract);
}
