import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const contractor = await prisma.contractor.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!contractor) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.type !== "application/pdf")
    return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 415 });
  if (file.size > MAX_FILE_BYTES)
    return NextResponse.json({ error: "File must be 10 MB or smaller" }, { status: 413 });

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
  } catch (e) {
    console.error("Failed to read file buffer:", e);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }

  const contract = await prisma.contractorContract.create({
    data: { contractorId: id, contractPdfFilename: file.name, signingStatus: "UPLOADED" },
  });

  let docusealRes: Response;
  try {
    docusealRes = await fetch(`${process.env.DOCUSEAL_API_URL}/templates/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": process.env.DOCUSEAL_API_KEY! },
      body: JSON.stringify({
        name: `${contractor.name} — ${file.name}`,
        documents: [{ name: file.name, file: bytes.toString("base64") }],
      }),
    });
  } catch (e) {
    console.error("DocuSeal fetch failed:", e);
    await prisma.contractorContract.delete({ where: { id: contract.id } });
    return NextResponse.json({ error: "Could not reach DocuSeal API" }, { status: 502 });
  }

  if (!docusealRes.ok) {
    const err = await docusealRes.text();
    await prisma.contractorContract.delete({ where: { id: contract.id } });
    return NextResponse.json({ error: `DocuSeal error ${docusealRes.status}: ${err}` }, { status: 502 });
  }

  const template = (await docusealRes.json()) as { id: number };
  await prisma.contractorContract.update({
    where: { id: contract.id },
    data: { docusealTemplateId: template.id },
  });

  return NextResponse.json({ contractId: contract.id, templateId: template.id });
}
