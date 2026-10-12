import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCommunications } from "@/lib/erpAuth";
import { buildProjectMessageEmail, sendEmail } from "@/lib/email";
import { parseEmailList } from "@/lib/notificationTypes";
import { loadEmailQuota } from "@/lib/erp/emailQuota";
import { projectMessageLink } from "@/lib/erp/projectMessageLink";
import { attachmentProblem } from "@/lib/erp/emailAttachments";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const MAX_RECIPIENTS = 25;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 20_000;

/**
 * Sends an email written on the project's Communications tab. Body:
 * { to: string[], cc?: string[], subject, message, preview? }. With preview
 * nothing is sent: it runs the same checks and says which project button
 * the email would carry, for the review step. To attach files, send
 * multipart instead: the same fields (to and cc as JSON arrays) plus one or
 * more "files". Those are stored with the log row. The sender is always
 * copied and replies go to them, since the email itself comes from the
 * shared Sueep address. Saved in the Email Log against this project.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageCommunications(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, jobTitle: true, buildingId: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  let files: File[] = [];
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const text = (k: string) => String(form.get(k) ?? "");
      body = { to: JSON.parse(text("to") || "[]"), cc: JSON.parse(text("cc") || "[]"), subject: text("subject"), message: text("message") };
      files = form.getAll("files").filter((f): f is File => f instanceof File);
    } else {
      body = (await req.json()) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const fileProblem = attachmentProblem(files);
  if (fileProblem) return NextResponse.json({ error: fileProblem }, { status: 400 });

  const to = parseEmailList(body.to ?? []);
  const extraCc = parseEmailList(body.cc ?? []);
  if (!to || !extraCc) return NextResponse.json({ error: "One of the email addresses doesn't look right" }, { status: 400 });
  if (!to.length) return NextResponse.json({ error: "Pick at least one recipient" }, { status: 400 });
  const sender = auth.email.trim().toLowerCase();
  const cc = [sender, ...extraCc.filter((e) => e !== sender)].filter((e) => !to.includes(e));
  if (to.length + cc.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `That's too many people for one email (${MAX_RECIPIENTS} at most)` }, { status: 400 });
  }

  const subject = String(body.subject ?? "").replace(/\s+/g, " ").trim();
  const message = String(body.message ?? "").trim();
  if (!subject) return NextResponse.json({ error: "Enter a subject" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Write a message" }, { status: 400 });
  if (subject.length > MAX_SUBJECT) return NextResponse.json({ error: "That subject is too long" }, { status: 400 });
  if (message.length > MAX_MESSAGE) return NextResponse.json({ error: "That message is too long" }, { status: 400 });

  // Each address counts as one email against the day's quota.
  const quota = await loadEmailQuota();
  const left = Math.max(0, quota.cutoff - quota.used);
  if (to.length + cc.length > left) {
    return NextResponse.json(
      {
        error:
          left === 0
            ? "Project emails are paused for today so the automatic ones can still go out. Try again after the daily limit resets."
            : `Only ${left} more ${left === 1 ? "address" : "addresses"} can be emailed today, and this one goes to ${to.length + cc.length}. Remove some people or send it after the daily limit resets.`,
      },
      { status: 429 },
    );
  }

  const button = await projectMessageLink({ projectId: project.id, buildingId: project.buildingId, to, cc });
  if (body.preview === true) return NextResponse.json({ ok: true, preview: true, link: button?.kind ?? null });

  const attachments = await Promise.all(
    files.map(async (f) => ({ filename: f.name.replace(/[\\/"]/g, "_").slice(0, 200), content: Buffer.from(await f.arrayBuffer()), mimeType: f.type || undefined })),
  );

  try {
    const status = await sendEmail({
      type: "PROJECT_MESSAGE",
      to,
      cc,
      replyTo: auth.email,
      subject,
      html: buildProjectMessageEmail({ message, projectTitle: project.jobTitle, senderEmail: auth.email, button }),
      link: `/erp/projects/${project.id}`,
      sentBy: auth.email,
      attachments: attachments.length ? attachments : undefined,
      keepAttachments: true,
    });
    if (status === "SKIPPED") {
      return NextResponse.json({ error: "Email isn't set up on this server, so nothing was sent. It was saved in the Email Log as skipped." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, to, cc });
  } catch (e) {
    console.error("POST project message", e);
    return NextResponse.json({ error: "The email could not be sent. It's in the Email Log as failed." }, { status: 502 });
  }
}
