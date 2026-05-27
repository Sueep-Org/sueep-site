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

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
  } catch (e) {
    console.error("Failed to read file buffer:", e);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }

  // Save the PDF first so the file-serving route can serve it to DocuSeal
  try {
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
  } catch (e) {
    console.error("Failed to save PDF to database:", e);
    return NextResponse.json({ error: "Failed to save contract to database" }, { status: 500 });
  }

  // Generate a short-lived signed token so DocuSeal can fetch the PDF
  let fileToken: string;
  try {
    const secret = new TextEncoder().encode(process.env.ERP_SESSION_SECRET!);
    fileToken = await new SignJWT({ coId: changeOrderId })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("15m")
      .sign(secret);
  } catch (e) {
    console.error("Failed to sign file token:", e);
    return NextResponse.json({ error: "Failed to generate secure file link" }, { status: 500 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) {
    console.error("NEXT_PUBLIC_APP_URL is not set");
    return NextResponse.json({ error: "App URL not configured — set NEXT_PUBLIC_APP_URL in .env.local" }, { status: 500 });
  }

  const fileUrl = `${appUrl}/api/erp/projects/${id}/change-orders/${changeOrderId}/contract/file?token=${fileToken}`;
  console.log("DocuSeal file URL:", fileUrl);

  let docusealRes: Response;
  try {
    docusealRes = await fetch(`${process.env.DOCUSEAL_API_URL}/templates`, {
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
  } catch (e) {
    console.error("DocuSeal fetch failed:", e);
    return NextResponse.json({ error: "Could not reach DocuSeal API" }, { status: 502 });
  }

  if (!docusealRes.ok) {
    const err = await docusealRes.text();
    console.error(`DocuSeal create template error [${docusealRes.status}]:`, err);
    return NextResponse.json({ error: `DocuSeal error ${docusealRes.status}: ${err}` }, { status: 502 });
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
