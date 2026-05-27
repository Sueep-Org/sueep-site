import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;

  const co = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
    select: { id: true, docusealTemplateId: true, signingStatus: true },
  });
  if (!co) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!co.docusealTemplateId) {
    return NextResponse.json({ error: "Upload and configure the contract first" }, { status: 400 });
  }
  if (co.signingStatus === "SIGNED") {
    return NextResponse.json({ error: "Contract already signed" }, { status: 409 });
  }

  const body = (await req.json()) as { customerEmail?: string };
  const email = body.customerEmail?.trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid customer email is required" }, { status: 400 });
  }

  const docusealRes = await fetch(`${process.env.DOCUSEAL_API_URL}/submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": process.env.DOCUSEAL_API_KEY!,
    },
    body: JSON.stringify({
      template_id: co.docusealTemplateId,
      send_email: true,
      submitters: [{ email, role: "First Party" }],
    }),
  });

  if (!docusealRes.ok) {
    const err = await docusealRes.text();
    console.error("DocuSeal create submission error:", err);
    return NextResponse.json({ error: "Failed to create signing request" }, { status: 502 });
  }

  const submitters = (await docusealRes.json()) as { id: number; slug: string }[];
  const submitter = submitters[0];

  await prisma.projectChangeOrder.update({
    where: { id: changeOrderId },
    data: {
      customerEmail: email,
      docusealSubmissionId: submitter.id,
      signingStatus: "SENT",
    },
  });

  return NextResponse.json({ ok: true, signingUrl: `https://docuseal.com/s/${submitter.slug}` });
}
