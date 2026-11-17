import { NextResponse } from "next/server";
import { getErpAuth, isPmLevel } from "@/lib/erpAuth";
import { attachmentProblem } from "@/lib/erp/emailAttachments";
import { MAX_BULK_RECIPIENTS, sendBulkSubEmail, sendBulkTestEmail, type BulkMessage } from "@/lib/erp/subBulkEmail";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Contractors → Email subs. Admin, PM and Business Manager. Multipart:
 * "payload" is the JSON below, "files" the attachments (same limits as
 * project messages). With test: true it emails only the sender.
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPmLevel(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: Record<string, unknown>;
  let files: File[] = [];
  try {
    const form = await req.formData();
    raw = JSON.parse(String(form.get("payload") ?? "{}")) as Record<string, unknown>;
    files = form.getAll("files").filter((f): f is File => f instanceof File);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const fileProblem = attachmentProblem(files);
  if (fileProblem) return NextResponse.json({ error: fileProblem }, { status: 400 });

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const ids = Array.isArray(raw.ids) ? [...new Set(raw.ids.filter((v): v is string => typeof v === "string"))] : [];
  const msg: BulkMessage = {
    subject: str(raw.subject).trim(),
    body: str(raw.body).trim(),
    subjectEs: str(raw.subjectEs).slice(0, 200),
    bodyEs: str(raw.bodyEs).slice(0, 10_000),
    includeInfoLink: raw.includeInfoLink === true,
    includePortalLink: raw.includePortalLink === true,
  };
  if (!msg.subject || !msg.body) return NextResponse.json({ error: "Write a subject and a message" }, { status: 400 });
  if (msg.subject.length > 200 || msg.body.length > 10_000) return NextResponse.json({ error: "Subject or message is too long" }, { status: 400 });

  const attachments = await Promise.all(
    files.map(async (f) => ({ filename: f.name.replace(/[\\/"]/g, "_").slice(0, 200), content: Buffer.from(await f.arrayBuffer()), mimeType: f.type || undefined })),
  );

  if (raw.test === true) {
    const r = await sendBulkTestEmail(ids[0] ?? null, msg, attachments, auth.email);
    return "error" in r ? NextResponse.json(r, { status: 502 }) : NextResponse.json({ ok: true, to: auth.email });
  }

  if (!ids.length) return NextResponse.json({ error: "Pick at least one sub" }, { status: 400 });
  if (ids.length > MAX_BULK_RECIPIENTS) return NextResponse.json({ error: `At most ${MAX_BULK_RECIPIENTS} subs at a time` }, { status: 400 });
  return NextResponse.json(await sendBulkSubEmail(ids, msg, attachments, auth.email));
}
