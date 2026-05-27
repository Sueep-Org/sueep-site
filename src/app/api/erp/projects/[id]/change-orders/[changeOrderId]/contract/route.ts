import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;

  const co = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
    select: { id: true, title: true },
  });
  if (!co) return NextResponse.json({ error: "Change order not found" }, { status: 404 });

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 415 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File must be 10 MB or smaller" }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Save the PDF first so the file-serving route can serve it to DocuSeal
  await prisma.projectChangeOrder.update({
    where: { id: changeOrderId },
    data: {
      contractPdfData: bytes,
      contractPdfFilename: file.name,
      docusealTemplateId: null,
      signingStatus: "UPLOADED",
      docusealSubmissionId: null,
      signedAt: null,
      signedDocumentUrl: null,
    },
  });

  // Generate a short-lived signed token so DocuSeal can fetch the PDF
  const secret = new TextEncoder().encode(process.env.ERP_SESSION_SECRET!);
  const fileToken = await new SignJWT({ coId: changeOrderId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(secret);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, "");
  const fileUrl = `${appUrl}/api/erp/projects/${id}/change-orders/${changeOrderId}/contract/file?token=${fileToken}`;

  const docusealRes = await fetch(`${process.env.DOCUSEAL_API_URL}/templates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": process.env.DOCUSEAL_API_KEY!,
    },
    body: JSON.stringify({
      name: co.title,
      documents: [{ name: file.name, url: fileUrl }],
    }),
  });

  if (!docusealRes.ok) {
    const err = await docusealRes.text();
    console.error(`DocuSeal create template error [${docusealRes.status}]:`, err);
    return NextResponse.json({ error: "Failed to create DocuSeal template" }, { status: 502 });
  }

  const template = (await docusealRes.json()) as { id: number };

  await prisma.projectChangeOrder.update({
    where: { id: changeOrderId },
    data: { docusealTemplateId: template.id },
  });

  return NextResponse.json({ templateId: template.id });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;

  const co = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
    select: { id: true, signingStatus: true },
  });
  if (!co) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (co.signingStatus === "SENT" || co.signingStatus === "SIGNED") {
    return NextResponse.json({ error: "Cannot remove contract after it has been sent" }, { status: 409 });
  }

  await prisma.projectChangeOrder.update({
    where: { id: changeOrderId },
    data: {
      contractPdfData: null,
      contractPdfFilename: null,
      docusealTemplateId: null,
      signingStatus: null,
      customerEmail: null,
    },
  });

  return NextResponse.json({ ok: true });
}
