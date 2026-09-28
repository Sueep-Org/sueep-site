import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { ensureBuildingCoordinates } from "@/lib/erp/geocode";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Sets the contract building's location for the clock-in location check.
 * Body { action }:
 *   "lookup"      - look the address up again (even if it wasn't found before)
 *   "fromClockIn" - use where a janitor last clocked in at this building
 *   "manual"      - { latitude, longitude }, e.g. pasted from Google Maps
 *   "clear"       - forget the location (turns the check off for this building)
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contract = await prisma.recurringContract.findUnique({ where: { id }, select: { buildingId: true } });
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  const buildingId = contract.buildingId;

  const setManual = (latitude: number, longitude: number) =>
    prisma.building.update({
      where: { id: buildingId },
      data: { latitude, longitude, geocodeStatus: "MANUAL", geocodedAt: new Date() },
    });

  switch (String(body.action ?? "")) {
    case "lookup": {
      await prisma.building.update({ where: { id: buildingId }, data: { latitude: null, longitude: null } });
      const coords = await ensureBuildingCoordinates(buildingId, { retryNotFound: true });
      if (!coords) {
        return NextResponse.json(
          { error: "The address still couldn't be found. Use a clock-in location or paste coordinates instead." },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true });
    }
    case "fromClockIn": {
      const entry = await prisma.janitorialTimeEntry.findFirst({
        where: { recurringContractId: id, clockInLatitude: { not: null }, clockInLongitude: { not: null } },
        orderBy: { clockInAt: "desc" },
        select: { clockInLatitude: true, clockInLongitude: true },
      });
      if (!entry) return NextResponse.json({ error: "No one has clocked in here with location yet" }, { status: 404 });
      await setManual(entry.clockInLatitude!, entry.clockInLongitude!);
      return NextResponse.json({ ok: true });
    }
    case "manual": {
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return NextResponse.json({ error: "Enter coordinates like 40.0875, -75.4104" }, { status: 400 });
      }
      await setManual(latitude, longitude);
      return NextResponse.json({ ok: true });
    }
    case "clear":
      await prisma.building.update({
        where: { id: buildingId },
        data: { latitude: null, longitude: null, geocodeStatus: "NOT_FOUND", geocodedAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
