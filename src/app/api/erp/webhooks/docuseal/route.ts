import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type DocusealWebhookPayload = {
  event_type: string;
  data: Record<string, unknown> & {
    submission?: Record<string, unknown> & {
      id?: number;
      documents?: { url?: string; combined_document_url?: string }[];
      submitters?: { completed_at?: string | null }[];
      combined_document_url?: string;
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

  console.log("DocuSeal webhook received:", payload.event_type, JSON.stringify(payload.data));

  if (!COMPLETED_EVENTS.has(payload.event_type)) {
    return NextResponse.json({ ok: true });
  }

  // DocuSeal payload can nest the submission under data.submission or directly in data
  const submission = payload.data?.submission ?? (payload.data as Record<string, unknown> | undefined);
  if (!submission?.id) return NextResponse.json({ ok: true });

  // Try multiple locations where DocuSeal may put the signed document URL
  const sub = submission as Record<string, unknown>;
  const documents = (sub.documents as { url?: string; combined_document_url?: string }[] | undefined);
  const signedDocumentUrl =
    documents?.[0]?.url ??
    documents?.[0]?.combined_document_url ??
    (sub.combined_document_url as string | undefined) ??
    null;

  console.log("DocuSeal signed document URL resolved:", signedDocumentUrl);
  const completedAt = sub.submitters
    ? (sub.submitters as { completed_at?: string | null }[])[0]?.completed_at
    : null;
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
