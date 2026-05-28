import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type DocusealWebhookPayload = {
  event_type: string;
  data: {
    submission?: {
      id: number;
      documents?: { url: string }[];
      submitters?: { completed_at?: string | null }[];
    };
  };
};

const COMPLETED_EVENTS = new Set(["submission.completed", "form.completed"]);

export async function POST(req: Request) {
  let payload: DocusealWebhookPayload;
  try {
    payload = (await req.json()) as DocusealWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.log("DocuSeal webhook received:", payload.event_type);

  if (!COMPLETED_EVENTS.has(payload.event_type)) {
    return NextResponse.json({ ok: true });
  }

  const submission = payload.data?.submission;
  if (!submission?.id) return NextResponse.json({ ok: true });

  const signedDocumentUrl = submission.documents?.[0]?.url ?? null;
  const completedAt = submission.submitters?.[0]?.completed_at;
  const signedAt = completedAt ? new Date(completedAt) : new Date();
  const updateData = { signingStatus: "SIGNED", signedAt, signedDocumentUrl };

  const [coContract, empContract, contractorContract, candidateContract] = await Promise.all([
    prisma.changeOrderContract.findFirst({ where: { docusealSubmissionId: submission.id }, select: { id: true, signingStatus: true } }),
    prisma.employeeContract.findFirst({ where: { docusealSubmissionId: submission.id }, select: { id: true, signingStatus: true } }),
    prisma.contractorContract.findFirst({ where: { docusealSubmissionId: submission.id }, select: { id: true, signingStatus: true } }),
    prisma.candidateContract.findFirst({ where: { docusealSubmissionId: submission.id }, select: { id: true, signingStatus: true } }),
  ]);

  if (coContract && coContract.signingStatus !== "SIGNED") {
    await prisma.changeOrderContract.update({ where: { id: coContract.id }, data: updateData });
  } else if (empContract && empContract.signingStatus !== "SIGNED") {
    await prisma.employeeContract.update({ where: { id: empContract.id }, data: updateData });
  } else if (contractorContract && contractorContract.signingStatus !== "SIGNED") {
    await prisma.contractorContract.update({ where: { id: contractorContract.id }, data: updateData });
  } else if (candidateContract && candidateContract.signingStatus !== "SIGNED") {
    await prisma.candidateContract.update({ where: { id: candidateContract.id }, data: updateData });
  }

  return NextResponse.json({ ok: true });
}
