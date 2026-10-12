import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCommunications } from "@/lib/erpAuth";
import { isEmailAddress } from "@/lib/erp/projectContacts";

type Ctx = { params: Promise<{ id: string; contactId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageCommunications(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, contactId } = await ctx.params;
  const existing = await prisma.projectContact.findFirst({
    where: { id: contactId, projectId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The HubSpot sync rewrites these on every run, so an edit here wouldn't stick.
  if (existing.source === "HUBSPOT") {
    return NextResponse.json({ error: "This contact comes from HubSpot. Edit it there, then sync." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.fullName !== undefined) {
    const fullName = String(body.fullName || "").trim();
    if (!fullName) return NextResponse.json({ error: "fullName is required" }, { status: 400 });
    data.fullName = fullName;
  }
  if (body.role !== undefined) data.role = body.role != null ? String(body.role).trim() || null : null;
  if (body.company !== undefined) data.company = body.company != null ? String(body.company).trim() || null : null;
  if (body.email !== undefined) {
    const email = body.email != null ? String(body.email).trim() : "";
    if (email && !isEmailAddress(email)) return NextResponse.json({ error: "That email address doesn't look right" }, { status: 400 });
    data.email = email || null;
  }
  if (body.phone !== undefined) data.phone = body.phone != null ? String(body.phone).trim() || null : null;
  if (body.notes !== undefined) data.notes = body.notes != null ? String(body.notes).trim() || null : null;
  if (body.isPrimary !== undefined) data.isPrimary = Boolean(body.isPrimary);

  try {
    const updated = await prisma.projectContact.update({
      where: { id: contactId },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH project contact", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/** Removes a contact added by hand. HubSpot contacts are removed in HubSpot. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageCommunications(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, contactId } = await ctx.params;
  const existing = await prisma.projectContact.findFirst({
    where: { id: contactId, projectId: id },
    select: { source: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.source === "HUBSPOT") {
    return NextResponse.json({ error: "This contact comes from HubSpot. Remove it there, then sync." }, { status: 400 });
  }
  await prisma.projectContact.delete({ where: { id: contactId } });
  return NextResponse.json({ ok: true });
}
