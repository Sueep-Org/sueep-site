/**
 * Approve / Deny for a change order made from a client's scheduling request
 * ("Turn into a change order" on the schedule). Same page and link format as
 * the property manager's sub change order approval (/co-approve/[token], see
 * subCoApproval.ts), which falls back to these when its token isn't a sub
 * request. Only works while the change order is SUBMITTED.
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { escapeHtml, formatUsd, sendEmail } from "@/lib/email";
import { nextDayUpchargeLabel } from "@/lib/nextDayUpcharge";
import type { ApprovalView } from "./subCoApproval";

/** A fresh key for the Approve / Deny link (same shape isApprovalToken accepts). */
export function newClientApprovalToken(): string {
  return randomBytes(24).toString("hex");
}

const load = (token: string) =>
  prisma.projectChangeOrder.findUnique({
    where: { clientApprovalToken: token },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      contractValueCents: true,
      nextDayUpcharge: true,
      requestedBy: true,
      requestedDate: true,
      clientAnsweredAt: true,
      statusNote: true,
      project: { select: { id: true, jobTitle: true, building: { select: { address: true } }, workOrderRecord: { select: { siteAddress: true } } } },
    },
  });

/** The page for a client change order, or null when the token isn't one. */
export async function loadClientCoView(token: string, nextDayPct: number): Promise<ApprovalView | null> {
  const co = await load(token);
  if (!co) return null;
  const total = co.contractValueCents ?? 0;
  // Split the next day upcharge back out of the price for the page.
  const surchargeCents = co.nextDayUpcharge && total > 0 ? Math.round((total * nextDayPct) / (100 + nextDayPct)) : 0;
  const when = co.requestedDate?.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  // The day's note starts "Requested by <name> via project portal: ..." (project-requests route); keep just what they asked.
  const asked = co.description
    ?.split("\n")
    .map((l) => l.replace(/^Requested by .*? via project portal:?\s*/i, "").trim())
    .filter(Boolean)
    .join(" ");
  return {
    unit: co.project.jobTitle,
    address: co.project.building?.address ?? co.project.workOrderRecord?.siteAddress ?? null,
    intro: `Work you asked for${when ? ` on ${when}` : ""} that isn't in the contract, set up as a change order: ${co.title}.${asked ? ` What you asked for: ${asked}` : ""}`,
    lines: [{ label: co.title, quantity: 1, totalCents: total - surchargeCents }],
    surcharge: surchargeCents ? { label: nextDayUpchargeLabel(nextDayPct).replace(/ \(\+\d+%\)$/, ""), percent: nextDayPct, cents: surchargeCents } : null,
    totalCents: total,
    photoIds: [],
    state:
      co.status === "SUBMITTED" && total > 0
        ? "open"
        : co.status === "APPROVED" || co.status === "BILLING" || co.status === "COMPLETED"
          ? "approved"
          : co.status === "REJECTED"
            ? "denied"
            : co.status === "VOID"
              ? "withdrawn"
              : "updating",
    answeredAt: co.clientAnsweredAt?.toISOString() ?? null,
    denyReason: co.status === "REJECTED" ? co.statusNote : null,
    contact: null,
  };
}

/**
 * The client's Approve / Deny. Approve moves the change order to APPROVED,
 * Deny to REJECTED with their reason as its rejection note. The office is
 * emailed either way. Null when the token isn't a client change order.
 */
export async function recordClientCoAnswer(
  token: string,
  answer: "APPROVED" | "DENIED",
  reasonRaw: string | null,
): Promise<null | { error: string } | { state: ApprovalView["state"] }> {
  const co = await load(token);
  if (!co) return null;
  if (co.clientAnsweredAt || co.status === "APPROVED" || co.status === "REJECTED") return { error: "This change order was already answered." };
  if (co.status === "VOID") return { error: "We withdrew this change order, so there's nothing to answer." };
  if (co.status !== "SUBMITTED" || !co.contractValueCents) return { error: "We're updating this change order. You'll hear from us shortly." };

  const who = co.requestedBy?.replace(/\s*<.*>$/, "").trim() || "The client";
  const reason = answer === "DENIED" ? reasonRaw?.trim().slice(0, 500) || null : null;
  const claimed = await prisma.projectChangeOrder.updateMany({
    where: { id: co.id, status: "SUBMITTED", clientAnsweredAt: null },
    data:
      answer === "APPROVED"
        ? { status: "APPROVED", clientAnsweredAt: new Date() }
        : {
            status: "REJECTED",
            clientAnsweredAt: new Date(),
            statusNote: `${who} denied it${reason ? `: ${reason}` : " (no reason given)"}`,
            statusNoteBy: co.requestedBy?.match(/<(.+)>/)?.[1] ?? "client",
            statusNoteAt: new Date(),
          },
  });
  if (!claimed.count) return { error: "This change order was just answered. Reload the page." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const link = `/erp/projects/${co.project.id}/change-orders/${co.id}`;
  const approved = answer === "APPROVED";
  await sendEmail({
    type: "CLIENT_CO_ANSWERED",
    subject: `${approved ? "Approved" : "Denied"}: ${co.title} (${co.project.jobTitle})`,
    link,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:640px">
        <h2 style="margin-bottom:12px;color:${approved ? "#16a34a" : "#6b7280"}">Change order ${approved ? "approved" : "denied"}</h2>
        <p><strong>${escapeHtml(who)}</strong> ${approved ? "approved" : "denied"} <strong>${escapeHtml(co.title)}</strong> on ${escapeHtml(co.project.jobTitle)} (${formatUsd(co.contractValueCents)}).</p>
        ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}
        <p>It's now <strong>${approved ? "Approved" : "Rejected"}</strong> in the ERP.${approved ? " Schedule the crew if it isn't already." : ""}</p>
        ${appUrl ? `<p><a href="${escapeHtml(`${appUrl}${link}`)}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Open the change order</a></p>` : ""}
      </div>`,
  }).catch((e) => console.error("Client change order answer email failed", { id: co.id }, e));

  return { state: approved ? "approved" : "denied" };
}

/** Approve / Deny buttons for the client's email, linking to /co-approve/[token]. */
export function clientApprovalButtonsHtml(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  if (!base || /your-vercel-domain/.test(base)) return "";
  const page = `${base}/co-approve/${token}`;
  const btn = (label: string, bg: string, answer: string) =>
    `<a href="${escapeHtml(`${page}?answer=${answer}`)}" style="display:inline-block;padding:10px 18px;margin-right:8px;border-radius:6px;background:${bg};color:#fff;text-decoration:none;font-weight:600">${label}</a>`;
  return `<p style="margin:20px 0 4px">Can we go ahead?</p><p>${btn("Approve", "#16a34a", "approve")}${btn("Deny", "#6b7280", "deny")}</p><p style="color:#6b7280;font-size:13px">We won't start this work until you approve it.</p>`;
}
