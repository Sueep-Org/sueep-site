import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; contractId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id, contractId } = await ctx.params;

  const contract = await prisma.contractorContract.findFirst({
    where: { id: contractId, contractorId: id },
    select: { id: true, docusealTemplateId: true, signingStatus: true },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!contract.docusealTemplateId)
    return NextResponse.json({ error: "Upload and configure the contract first" }, { status: 400 });
  if (contract.signingStatus === "SIGNED")
    return NextResponse.json({ error: "Contract already signed" }, { status: 409 });

  const body = (await req.json()) as { signerEmail?: string };
  const email = body.signerEmail?.trim();
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "Valid signer email is required" }, { status: 400 });

  const docusealRes = await fetch(`${process.env.DOCUSEAL_API_URL}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Token": process.env.DOCUSEAL_API_KEY! },
    body: JSON.stringify({
      template_id: contract.docusealTemplateId,
      send_email: true,
      submitters: [{ email, role: "First Party" }],
    }),
  });

  if (!docusealRes.ok) {
    const err = await docusealRes.text();
    console.error("DocuSeal create submission error:", err);
    return NextResponse.json({ error: "Failed to create signing request" }, { status: 502 });
  }

  const submitters = (await docusealRes.json()) as { id: number; submission_id: number }[];
  const submitter = submitters[0];

  await prisma.contractorContract.update({
    where: { id: contractId },
    data: { signerEmail: email, docusealSubmissionId: submitter.submission_id, signingStatus: "SENT" },
  });

  return NextResponse.json({ ok: true });
}
