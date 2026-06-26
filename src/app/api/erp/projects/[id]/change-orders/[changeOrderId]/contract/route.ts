import { NextResponse } from "next/server";
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

  // Pre-signed path: store the PDF as a base64 data URL, skip DocuSeal
  if (fd.get("presigned") === "true") {
    const signedAtRaw = fd.get("signedAt");
    const signedAt = typeof signedAtRaw === "string" && signedAtRaw
      ? new Date(`${signedAtRaw}T00:00:00Z`)
      : new Date();
    const dataUrl = `data:application/pdf;base64,${bytes.toString("base64")}`;
    const contract = await prisma.changeOrderContract.create({
      data: { changeOrderId, contractPdfFilename: file.name, signingStatus: "SIGNED", signedAt, signedDocumentUrl: dataUrl },
    });
    return NextResponse.json({ contractId: contract.id });
  }

  // Create a contract record first so we have an ID
  const contract = await prisma.changeOrderContract.create({
    data: {
      changeOrderId,
      contractPdfFilename: file.name,
      signingStatus: "UPLOADED",
    },
  });

  // POST /templates/pdf accepts JSON with base64-encoded file content
  let docusealRes: Response;
  try {
    docusealRes = await fetch(`${process.env.DOCUSEAL_API_URL}/templates/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": process.env.DOCUSEAL_API_KEY!,
      },
      body: JSON.stringify({
        name: co.title,
        documents: [{ name: file.name, file: bytes.toString("base64") }],
      }),
    });
  } catch (e) {
    console.error("DocuSeal fetch failed:", e);
    await prisma.changeOrderContract.delete({ where: { id: contract.id } });
    return NextResponse.json({ error: "Could not reach DocuSeal API" }, { status: 502 });
  }

  if (!docusealRes.ok) {
    const err = await docusealRes.text();
    console.error(`DocuSeal create template error [${docusealRes.status}]:`, err);
    await prisma.changeOrderContract.delete({ where: { id: contract.id } });
    return NextResponse.json({ error: `DocuSeal error ${docusealRes.status}: ${err}` }, { status: 502 });
  }

  const template = (await docusealRes.json()) as { id: number };

  await prisma.changeOrderContract.update({
    where: { id: contract.id },
    data: { docusealTemplateId: template.id },
  });

  return NextResponse.json({ contractId: contract.id, templateId: template.id });
}
