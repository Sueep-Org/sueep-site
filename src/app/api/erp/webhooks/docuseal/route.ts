import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Submitter = { email?: string; completed_at?: string | null };
type Submission = {
  id?: number;
  template?: { id?: number };
  documents?: { url?: string; combined_document_url?: string }[];
  submitters?: Submitter[];
  combined_document_url?: string;
};

type DocusealWebhookPayload = {
  event_type: string;
  data: Record<string, unknown> & { submission?: Submission };
};

const COMPLETED_EVENTS = new Set(["submission.completed", "form.completed"]);
const CREATED_EVENTS = new Set(["submission.created"]);

export async function POST(req: Request) {
  let payload: DocusealWebhookPayload;
  try {
    payload = (await req.json()) as DocusealWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.log("DocuSeal webhook received:", payload.event_type, JSON.stringify(payload.data));

  const submission = payload.data?.submission ?? (payload.data as Submission | undefined);
  if (!submission?.id) return NextResponse.json({ ok: true });

  if (CREATED_EVENTS.has(payload.event_type)) {
    const templateId = submission.template?.id;
    if (!templateId) return NextResponse.json({ ok: true });

    const signerEmail = submission.submitters?.[0]?.email ?? null;
    const updateData = {
      signingStatus: "SENT",
      docusealSubmissionId: submission.id,
    };

    const [coContract, empContract, contractorContract, candidateContract] = await Promise.all([
      prisma.changeOrderContract.findFirst({ where: { docusealTemplateId: templateId, signingStatus: "UPLOADED" }, select: { id: true } }),
      prisma.employeeContract.findFirst({ where: { docusealTemplateId: templateId, signingStatus: "UPLOADED" }, select: { id: true } }),
      prisma.contractorContract.findFirst({ where: { docusealTemplateId: templateId, signingStatus: "UPLOADED" }, select: { id: true } }),
      prisma.candidateContract.findFirst({ where: { docusealTemplateId: templateId, signingStatus: "UPLOADED" }, select: { id: true } }),
    ]);

    if (coContract) {
      await prisma.changeOrderContract.update({ where: { id: coContract.id }, data: { ...updateData, customerEmail: signerEmail } });
    } else if (empContract) {
      await prisma.employeeContract.update({ where: { id: empContract.id }, data: { ...updateData, signerEmail } });
    } else if (contractorContract) {
      await prisma.contractorContract.update({ where: { id: contractorContract.id }, data: { ...updateData, signerEmail } });
    } else if (candidateContract) {
      await prisma.candidateContract.update({ where: { id: candidateContract.id }, data: { ...updateData, signerEmail } });
    }

    return NextResponse.json({ ok: true });
  }

  if (!COMPLETED_EVENTS.has(payload.event_type)) {
    return NextResponse.json({ ok: true });
  }

  const documents = submission.documents;
  const signedDocumentUrl =
    documents?.[0]?.url ??
    documents?.[0]?.combined_document_url ??
    (submission.combined_document_url as string | undefined) ??
    null;

  console.log("DocuSeal signed document URL resolved:", signedDocumentUrl);
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
