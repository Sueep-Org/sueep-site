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

  const contract = await prisma.changeOrderContract.findFirst({
    where: { docusealSubmissionId: submission.id },
    select: { id: true, signingStatus: true },
  });
  if (!contract || contract.signingStatus === "SIGNED") return NextResponse.json({ ok: true });

  const signedDocumentUrl = submission.documents?.[0]?.url ?? null;
  const completedAt = submission.submitters?.[0]?.completed_at;
  const signedAt = completedAt ? new Date(completedAt) : new Date();

  await prisma.changeOrderContract.update({
    where: { id: contract.id },
    data: { signingStatus: "SIGNED", signedAt, signedDocumentUrl },
  });

  return NextResponse.json({ ok: true });
}
