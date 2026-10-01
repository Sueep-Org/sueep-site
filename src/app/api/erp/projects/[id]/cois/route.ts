import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { requestHolders } from "@/lib/erp/coiRequests";

export const runtime = "nodejs";

/** Same cap as contractor documents (request bodies over ~4.5 MB fail on Vercel). */
const MAX_SIZE = 4 * 1024 * 1024;

type Ctx = { params: Promise<{ id: string }> };

function day(v: FormDataEntryValue | null): Date | null {
  const t = typeof v === "string" ? v.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Adds a COI to a project. Multipart: file, holderId or holderName, issuedOn, policyIds (repeated), sentOn, sentTo, notes, requestId. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Attach the COI PDF" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "The COI must be a PDF" }, { status: 415 });
  }

  const holderId = String(form.get("holderId") ?? "").trim() || null;
  let holderName = String(form.get("holderName") ?? "").trim();
  if (holderId) {
    const holder = await prisma.coiHolder.findUnique({ where: { id: holderId }, select: { name: true } });
    if (!holder) return NextResponse.json({ error: "Certificate holder not found" }, { status: 400 });
    holderName = holder.name;
  }
  if (!holderName) return NextResponse.json({ error: "Pick who the COI is for" }, { status: 400 });

  const issuedOn = day(form.get("issuedOn"));
  if (!issuedOn) return NextResponse.json({ error: "Issue date is required" }, { status: 400 });
  const sentOnRaw = form.get("sentOn");
  const sentOn = sentOnRaw ? day(sentOnRaw) : null;
  if (sentOnRaw && !sentOn) return NextResponse.json({ error: "Sent date is not a valid date" }, { status: 400 });

  const policyIds = [...new Set(form.getAll("policyIds").map(String).filter(Boolean))];
  if (!policyIds.length) return NextResponse.json({ error: "Pick the policies on this COI" }, { status: 400 });
  const policies = await prisma.insurancePolicy.findMany({ where: { id: { in: policyIds } } });
  if (policies.length !== policyIds.length) return NextResponse.json({ error: "A policy was not found" }, { status: 400 });

  // The COI is good until its first policy runs out, using the dates as
  // they are today (what the PDF shows), not whatever they're renewed to.
  const expiresAt = new Date(Math.min(...policies.map((p) => p.expiresAt.getTime())));
  const text = (k: string) => String(form.get(k) ?? "").trim() || null;

  const requestId = text("requestId");
  const request = requestId
    ? await prisma.coiRequest.findFirst({ where: { id: requestId, projectId: id }, select: { id: true, holders: true, status: true } })
    : null;
  if (requestId && !request) return NextResponse.json({ error: "Request not found on this project" }, { status: 400 });

  const coi = await prisma.projectCoi.create({
    data: {
      projectId: id,
      holderId,
      holderName,
      issuedOn,
      expiresAt,
      sentOn,
      sentTo: sentOn ? text("sentTo") : null,
      notes: text("notes"),
      createdBy: auth.email,
      requestId: request?.id ?? null,
      filename: file.name || "coi.pdf",
      mimeType: "application/pdf",
      size: file.size,
      data: Buffer.from(await file.arrayBuffer()),
      policies: {
        create: policies.map((p) => ({
          policyId: p.id,
          policyType: p.policyType,
          carrier: p.carrier,
          policyNumber: p.policyNumber,
          expiresAt: p.expiresAt,
        })),
      },
    },
    select: { id: true },
  });

  // A request is done once it has a COI for each holder it asked for.
  if (request && request.status !== "DONE") {
    const count = await prisma.projectCoi.count({ where: { requestId: request.id } });
    if (count >= Math.max(1, requestHolders(request.holders).length)) {
      await prisma.coiRequest.update({ where: { id: request.id }, data: { status: "DONE" } });
    }
  }
  return NextResponse.json({ id: coi.id });
}
