/**
 * The lien fact sheet: one page of facts about an unpaid job for the
 * attorney who prepares the lien, plus the list of supporting documents
 * that go with it.
 *
 * It is deliberately not a legal notice. It has no legal wording, isn't
 * addressed to the owner or the contractor, and isn't meant to be sent to
 * either. The attorney writes the actual notice from these facts.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { todayEasternKey, utcDateKey } from "./dates";
import { LIEN_ROLE_OPTIONS, LIEN_STATE_OPTIONS, formatLienDay } from "./lienDeadline";
import { loadLienWatch } from "./lienWatch";

export type LienFactSheetInvoice = { id: string; number: string; dateKey: string | null; dueKey: string | null; amountCents: number; hasPdf: boolean };

export type LienFactSheetData = {
  preparedKey: string;
  jobTitle: string;
  stateLabel: string;
  hiredByLabel: string;
  propertyType: string;
  sueepName: string;
  sueepAddress: string;
  ownerName: string;
  ownerAddress: string;
  gcName: string;
  gcAddress: string;
  /** False when Sueep was hired by the owner, so there's no contractor to list */
  hasContractor: boolean;
  propertyDescription: string;
  workDescription: string;
  completedKey: string | null;
  amountCents: number;
  invoices: LienFactSheetInvoice[];
  deadlineKey: string;
  noticeLabel: string | null;
  noticeByKey: string | null;
  noticeSentKey: string | null;
  /** The rule the dates came from, in plain words */
  rule: string;
  signedContractOnFile: boolean;
};

/** What a person can change on the review form before the PDF is made. */
export type LienFactSheetOverrides = Partial<Pick<LienFactSheetData, "sueepAddress" | "propertyDescription" | "workDescription"> & { amountCents: number }>;

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * The fact sheet's contents from the project, or a reason it can't be made
 * yet. `missing` lists what would be blank on the page, and `warnings` what
 * a person should look at first; it can still be made with either.
 */
export async function loadLienFactSheet(
  projectId: string,
  overrides: LienFactSheetOverrides = {},
): Promise<{ data: LienFactSheetData; missing: string[]; warnings: string[] } | { error: string }> {
  const [row] = await loadLienWatch({ projectId });
  if (!row) return { error: "Project not found" };
  if (!row.deadline) return { error: "Set the state and the completion date before preparing a fact sheet." };

  const [project, company, invoices] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        jobTitle: true,
        lienOwnerName: true,
        lienOwnerAddress: true,
        lienGcName: true,
        lienGcAddress: true,
        workOrderRecord: { select: { siteAddress: true } },
        contracts: { where: { signingStatus: "SIGNED" }, select: { id: true }, take: 1 },
        sov: { select: { items: { where: { completed: true }, orderBy: { order: "asc" }, select: { description: true } } } },
      },
    }),
    prisma.companyInfoField.findMany({ where: { section: "COMPANY", label: { in: ["Company name", "Company address"] } }, select: { label: true, value: true } }),
    prisma.hubSpotSovInvoice.findMany({
      where: { projectId, status: "open" },
      orderBy: { invoiceDate: "asc" },
      distinct: ["hubspotInvoiceId"],
      select: { hubspotInvoiceId: true, invoiceNumber: true, invoiceDate: true, dueDate: true, balanceDueCents: true, invoiceTotalCents: true, pdfUrl: true },
    }),
  ]);
  if (!project) return { error: "Project not found" };

  const d = row.deadline;
  const lines = (project.sov?.items ?? []).map((i) => i.description.trim()).filter(Boolean);
  const defaultWork = lines.length > 0 ? `Post-construction cleaning labor and materials, including: ${lines.slice(0, 8).join("; ")}${lines.length > 8 ? "; and related work" : ""}.` : "Post-construction cleaning labor and materials.";
  // Company Info's address box is free text and can hold several addresses
  // and private notes. Only a plain single address is used as the starting
  // value; anything else is left for the person to type on the review form.
  const savedAddress = company.find((c) => c.label === "Company address")?.value?.trim() ?? "";
  const companyAddress = savedAddress.length <= 90 && !/[\n(]/.test(savedAddress) ? savedAddress : "";

  const data: LienFactSheetData = {
    preparedKey: todayEasternKey(),
    jobTitle: project.jobTitle,
    stateLabel: LIEN_STATE_OPTIONS.find((o) => o.value === d.state)?.label ?? d.state,
    hiredByLabel: row.role ? (LIEN_ROLE_OPTIONS.find((o) => o.value === row.role)?.label ?? "") : "Not set (treated as a general contractor)",
    propertyType: row.residential ? "Residential" : "Commercial",
    sueepName: company.find((c) => c.label === "Company name")?.value?.trim() || "Sueep LLC",
    sueepAddress: overrides.sueepAddress?.trim() ?? companyAddress,
    ownerName: project.lienOwnerName?.trim() ?? "",
    ownerAddress: project.lienOwnerAddress?.trim() ?? "",
    gcName: project.lienGcName?.trim() ?? "",
    gcAddress: project.lienGcAddress?.trim() ?? "",
    hasContractor: d.isSub,
    propertyDescription: overrides.propertyDescription?.trim() || project.workOrderRecord?.siteAddress?.trim() || "",
    workDescription: overrides.workDescription?.trim() || defaultWork,
    completedKey: row.completedKey,
    amountCents: overrides.amountCents != null && overrides.amountCents > 0 ? overrides.amountCents : row.unpaidCents,
    invoices: invoices.map((i) => ({
      id: i.hubspotInvoiceId,
      number: i.invoiceNumber ?? "Invoice",
      dateKey: i.invoiceDate ? utcDateKey(i.invoiceDate) : null,
      dueKey: i.dueDate ? utcDateKey(i.dueDate) : null,
      amountCents: i.balanceDueCents ?? i.invoiceTotalCents ?? 0,
      hasPdf: !!i.pdfUrl,
    })),
    deadlineKey: d.deadlineKey,
    noticeLabel: d.noticeLabel,
    noticeByKey: d.noticeByKey,
    noticeSentKey: row.noticeSentKey,
    rule: d.rule,
    signedContractOnFile: project.contracts.length > 0,
  };

  const missing: string[] = [];
  if (!data.ownerName || !data.ownerAddress) missing.push("Property owner name and mailing address");
  if (data.hasContractor && (!data.gcName || !data.gcAddress)) missing.push("General contractor name and mailing address");
  if (!data.propertyDescription) missing.push("Property address or description");
  if (!data.sueepAddress) missing.push("Sueep's address");

  const warnings: string[] = [];
  const listedCents = data.invoices.reduce((s, i) => s + i.amountCents, 0);
  if (data.invoices.length === 0) {
    warnings.push("No open invoice is linked to this job, so none are listed. Link them on Invoices & Quotes first.");
  } else if (Math.abs(listedCents - data.amountCents) > 100) {
    warnings.push(`The invoices listed add up to ${money(listedCents)}, but the amount claimed is ${money(data.amountCents)}. Check which is right.`);
  }
  if (!data.signedContractOnFile) warnings.push("No signed contract is saved on this project, so the packet won't include one.");
  return { data, missing, warnings };
}

// ── Drawing ───────────────────────────────────────────────────────────────

const PAGE = { width: 612, height: 792, margin: 46 };
const BLANK = "Not provided";

/** Helvetica only covers WinAnsi, and pdf-lib throws on anything else, so swap what's common and drop the rest. */
function makeSanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  const swaps: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", " ": " ", "\t": " " };
  return (value: string) => {
    let out = "";
    for (const ch of value.replace(/\r\n?/g, "\n")) {
      if (ch === "\n") { out += "\n"; continue; }
      for (const c of swaps[ch] ?? ch) if (supported.has(c.codePointAt(0)!)) out += c;
    }
    return out;
  };
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

export async function buildLienFactSheetPdf(data: LienFactSheetData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = makeSanitizer(regular);
  const width = PAGE.width - PAGE.margin * 2;
  const ink = rgb(0.07, 0.07, 0.07);
  const gray = rgb(0.42, 0.45, 0.5);
  const labelWidth = 160;

  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
  };
  const need = (height: number) => {
    if (y - height < PAGE.margin) newPage();
  };
  const text = (value: string, opts: { font?: PDFFont; size?: number; gap?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10.5;
    for (const line of wrap(clean(value), font, size, width)) {
      need(size + 4);
      page.drawText(line, { x: PAGE.margin, y: y - size, size, font, color: opts.color ?? ink });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };
  const section = (title: string) => {
    need(40);
    y -= 6;
    text(title.toUpperCase(), { font: bold, size: 9, color: gray, gap: 1 });
    page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.width - PAGE.margin, y }, thickness: 0.5, color: gray });
    y -= 6;
  };
  /** A label on the left and its value, wrapped, on the right. */
  const fact = (label: string, value: string | null | undefined) => {
    const shown = value && value.trim() ? value.trim() : BLANK;
    const lines = wrap(clean(shown), regular, 10, width - labelWidth);
    need(lines.length * 13 + 3);
    page.drawText(clean(label), { x: PAGE.margin, y: y - 10, size: 10, font: bold, color: ink });
    for (const line of lines) {
      page.drawText(line, { x: PAGE.margin + labelWidth, y: y - 10, size: 10, font: regular, color: shown === BLANK ? gray : ink });
      y -= 13;
    }
    y -= 3;
  };
  const day = (key: string | null) => (key ? formatLienDay(key) : null);

  newPage();
  text("Lien fact sheet", { font: bold, size: 16, gap: 1 });
  text(data.jobTitle, { size: 11, gap: 1 });
  text(`Prepared ${formatLienDay(data.preparedKey)} by ${data.sueepName} for attorney review. This is a summary of facts from our records. It is not a legal notice and is not for sending to the owner or the contractor.`, { size: 9, color: gray, gap: 4 });

  section("Claim");
  fact("Amount claimed", money(data.amountCents));
  fact("Work completed", day(data.completedKey));
  fact("Labor and materials", data.workDescription);
  fact("Signed contract on file", data.signedContractOnFile ? "Yes, enclosed" : "No");

  section("Parties");
  fact("Claimant", `${data.sueepName}${data.sueepAddress ? `\n${data.sueepAddress}` : ""}`);
  fact("Hired by", data.hiredByLabel);
  if (data.hasContractor) fact("General contractor", data.gcName ? `${data.gcName}${data.gcAddress ? `\n${data.gcAddress}` : ""}` : null);
  fact("Property owner", data.ownerName ? `${data.ownerName}${data.ownerAddress ? `\n${data.ownerAddress}` : ""}` : null);

  section("Property");
  fact("Address or description", data.propertyDescription);
  fact("State", data.stateLabel);
  fact("Property type", data.propertyType);

  section("Dates, as we understand them");
  fact("Last day to file", day(data.deadlineKey));
  if (data.noticeLabel) {
    fact("Notice required first", data.noticeLabel);
    fact("Notice due by", day(data.noticeByKey));
    fact("Notice sent", data.noticeSentKey ? day(data.noticeSentKey) : "Not yet");
  }
  text(`Based on: ${data.rule} Please confirm these dates.`, { size: 9, color: gray, gap: 2 });

  section("Unpaid invoices");
  if (data.invoices.length === 0) {
    text("None linked to this job in our system.", { color: gray });
  } else {
    const cols = [0, 160, 280, 400];
    // A short table stays together, so its total never lands alone on the next page.
    if (data.invoices.length <= 12) need((data.invoices.length + 2) * 15 + 4);
    const row = (cells: string[], font: PDFFont) => {
      need(16);
      cells.forEach((c, i) => page.drawText(clean(c), { x: PAGE.margin + cols[i], y: y - 10, size: 10, font, color: ink }));
      y -= 15;
    };
    row(["Invoice", "Date", "Due", "Balance"], bold);
    for (const inv of data.invoices) row([inv.number, day(inv.dateKey) ?? "", day(inv.dueKey) ?? "", money(inv.amountCents)], regular);
    row(["Total listed", "", "", money(data.invoices.reduce((s, i) => s + i.amountCents, 0))], bold);
  }

  return pdf.save();
}

// ── Packet ────────────────────────────────────────────────────────────────

export type LienPacketFile = { name: string; url: string };

/**
 * The supporting documents that go with the fact sheet, as links the browser
 * can fetch one at a time: signed contracts, change order contracts, the
 * unpaid invoices' PDFs and a labor log. The browser zips them, so no single
 * response has to carry the whole packet.
 */
export async function lienPacketFiles(projectId: string, invoices: LienFactSheetInvoice[]): Promise<LienPacketFile[]> {
  const [contracts, coContracts, laborCount] = await Promise.all([
    prisma.projectContract.findMany({ where: { projectId, signingStatus: "SIGNED" }, orderBy: { createdAt: "asc" }, select: { id: true, contractPdfFilename: true } }),
    prisma.changeOrderContract.findMany({
      where: { changeOrder: { projectId }, signingStatus: "SIGNED" },
      orderBy: { createdAt: "asc" },
      select: { id: true, contractPdfFilename: true, changeOrderId: true, changeOrder: { select: { title: true } } },
    }),
    prisma.laborEntry.count({ where: { projectId } }),
  ]);
  const base = `/api/erp/projects/${projectId}`;
  const pdfName = (name: string) => (name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`);
  return [
    ...contracts.map((c, i) => ({ name: `Contract ${i + 1} - ${pdfName(c.contractPdfFilename || "contract")}`, url: `${base}/contracts/${c.id}` })),
    ...coContracts.map((c) => ({ name: `Change order - ${pdfName(c.changeOrder.title.slice(0, 60))}`, url: `${base}/change-orders/${c.changeOrderId}/contracts/${c.id}` })),
    ...invoices.filter((i) => i.hasPdf).map((i) => ({ name: `Invoice ${i.number}.pdf`, url: `${base}/lien-packet/invoice/${i.id}` })),
    ...(laborCount > 0 ? [{ name: "Labor log.csv", url: `${base}/lien-packet/labor-log` }] : []),
  ];
}
