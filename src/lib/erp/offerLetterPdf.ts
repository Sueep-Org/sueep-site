/**
 * Offer letter PDF: the template's enabled sections with blanks filled in,
 * laid out on US Letter pages with the Sueep logo top right on every page.
 * A heading never sits alone at the bottom of a page and the signature block
 * is never split. Also reports where the signature and date lines landed so
 * DocuSeal fields can be placed on them when the letter is sent.
 */

import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import {
  DEFAULT_ACCEPT_BODY,
  DEFAULT_ACCEPT_LABEL,
  displayValues,
  fillBlanks,
  parseOfferBody,
  type OfferRun,
  type OfferSection,
} from "./offerLetters";
import { commissionTables, formatRate, parseMoneyCents, type CommissionPlan, type CommissionTable } from "./offerCommission";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 72;
const TOP = PAGE_H - 108; // first line, below the logo
const BOTTOM = 72;
const TEXT_W = PAGE_W - MARGIN_X * 2;

const BODY_SIZE = 11;
const LINE_H = 15.5;
const PARA_GAP = 9;
const HEADING_SIZE = 14;
const HEADING_BEFORE = 14;
const BULLET_X = MARGIN_X + 18;
const BULLET_TEXT_X = MARGIN_X + 36;
const SIGN_SPACE = 40; // room above a signature line
const SIGN_LINE_W = 200;

const TABLE_SIZE = 10.5;
const TABLE_LINE_H = 13.5;
const CELL_PAD = 7;

const INK = rgb(0.1, 0.1, 0.1);

/** Where a signature or date goes, in PDF points (origin bottom left) on a 0-based page. */
export type OfferFieldBox = { page: number; x: number; y: number; w: number; h: number };

export type OfferLetterPdf = {
  bytes: Uint8Array;
  pageCount: number;
  fields: { signerSignature: OfferFieldBox | null; candidateSignature: OfferFieldBox | null; candidateDate: OfferFieldBox | null };
};

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont };
type Seg = { text: string; font: PDFFont };

const REPLACEMENTS: Record<string, string> = { " ": " ", " ": " ", " ": " ", "−": "-", "‐": "-", "‑": "-" };

let logoBytes: Buffer | null = null;

export async function renderOfferLetterPdf(input: {
  sections: OfferSection[];
  values: Record<string, string>;
  signerName: string | null;
  signerTitle: string | null;
  /** Needed when the letter has a commission section */
  commission?: CommissionPlan | null;
  /** Company signer's signature, stamped above their line (sent letters only) */
  signatureImage?: { bytes: Uint8Array; mimeType: string } | null;
  title?: string;
}): Promise<OfferLetterPdf> {
  const doc = await PDFDocument.create();
  if (input.title) doc.setTitle(input.title);
  doc.setCreator("Sueep ERP");

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const supported = new Set(fonts.regular.getCharacterSet());
  const clean = (text: string) => {
    let out = "";
    for (const ch of text) {
      const mapped = REPLACEMENTS[ch] ?? ch;
      for (const c of mapped) out += c === "\n" || supported.has(c.codePointAt(0)!) ? c : "?";
    }
    return out;
  };

  logoBytes ??= await readFile(path.join(process.cwd(), "public/sueeplogo.png"));
  const logo = await doc.embedPng(logoBytes);

  const values = displayValues(input.values);
  // The rate in the commission intro always matches the tables.
  if (input.commission) values.commissionRate = formatRate(input.commission.ratePct).replace(".0%", "%");
  const fill = (text: string) => clean(fillBlanks(text, values));

  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    drawLogo(page, logo);
    y = TOP;
  };
  newPage();
  const pageIndex = () => doc.getPageCount() - 1;
  /** Starts a new page unless `h` more points fit above the bottom margin. */
  const ensure = (h: number) => {
    if (y - h < BOTTOM && y < TOP) newPage();
  };

  const segsFor = (runs: OfferRun[], italic = false): Seg[] =>
    runs.map((r) => ({
      text: r.text,
      font: italic ? (r.bold ? fonts.boldItalic : fonts.italic) : r.bold ? fonts.bold : fonts.regular,
    }));

  /** Wraps and draws runs from x across to the right margin. Returns lines drawn. */
  const drawRuns = (segs: Seg[], x: number, size = BODY_SIZE) => {
    const lines = wrap(segs, PAGE_W - MARGIN_X - x, size);
    for (const line of lines) {
      ensure(LINE_H);
      let cx = x;
      for (const s of line) {
        page.drawText(s.text, { x: cx, y: y - size, size, font: s.font, color: INK });
        cx += s.font.widthOfTextAtSize(s.text, size);
      }
      y -= LINE_H;
    }
    return lines.length;
  };

  const drawBody = (text: string, italic = false) => {
    for (const block of parseOfferBody(fill(text))) {
      if (block.type === "para") {
        for (const line of block.lines) drawRuns(segsFor(line, italic), MARGIN_X);
      } else {
        for (const item of block.items) {
          ensure(LINE_H);
          page.drawText("•", { x: BULLET_X, y: y - BODY_SIZE, size: BODY_SIZE, font: fonts.regular, color: INK });
          drawRuns(segsFor(item, italic), BULLET_TEXT_X);
          y -= 3;
        }
      }
      y -= PARA_GAP;
    }
  };

  /** Lines a body would take, for keep-together checks. */
  const measureBody = (text: string) => {
    let h = 0;
    for (const block of parseOfferBody(fill(text))) {
      if (block.type === "para") {
        for (const line of block.lines) h += wrap(segsFor(line), TEXT_W, BODY_SIZE).length * LINE_H;
      } else {
        for (const item of block.items) h += wrap(segsFor(item), PAGE_W - MARGIN_X - BULLET_TEXT_X, BODY_SIZE).length * LINE_H + 3;
      }
      h += PARA_GAP;
    }
    return h;
  };

  const fields: OfferLetterPdf["fields"] = { signerSignature: null, candidateSignature: null, candidateDate: null };

  for (const s of input.sections) {
    if (!s.enabled) continue;

    if (s.kind === "signature") {
      const acceptBody = s.acceptBody ?? DEFAULT_ACCEPT_BODY;
      const signerLines = 1 + (input.signerTitle ? 1 : 0) + 1;
      const blockH =
        (s.title ? HEADING_BEFORE + LINE_H : 0) +
        measureBody(s.body) +
        SIGN_SPACE + signerLines * LINE_H + 24 +
        LINE_H + SIGN_SPACE + measureBody(acceptBody) + LINE_H;
      ensure(blockH);
      if (s.title) drawHeading(fill(s.title));
      drawBody(s.body);

      y -= SIGN_SPACE;
      fields.signerSignature = { page: pageIndex(), x: MARGIN_X, y, w: SIGN_LINE_W, h: SIGN_SPACE - 4 };
      if (input.signatureImage) {
        const img = input.signatureImage.mimeType === "image/png" ? await doc.embedPng(input.signatureImage.bytes) : await doc.embedJpg(input.signatureImage.bytes);
        // Fit inside the box above the line, keeping its shape, sitting on the line.
        const box = fields.signerSignature;
        const scale = Math.min(box.w / img.width, box.h / img.height);
        page.drawImage(img, { x: box.x + 2, y: box.y + 1, width: img.width * scale, height: img.height * scale });
      }
      page.drawLine({ start: { x: MARGIN_X, y }, end: { x: MARGIN_X + SIGN_LINE_W, y }, thickness: 0.8, color: INK });
      y -= 4;
      drawRuns([{ text: clean(input.signerName || ""), font: fonts.italic }], MARGIN_X);
      if (input.signerTitle) drawRuns([{ text: clean(input.signerTitle), font: fonts.regular }], MARGIN_X);
      drawRuns([{ text: "Sueep LLC", font: fonts.regular }], MARGIN_X);

      y -= 24;
      const label = s.acceptLabel ?? DEFAULT_ACCEPT_LABEL;
      if (label) drawRuns([{ text: fill(label), font: fonts.bold }], MARGIN_X);
      y -= SIGN_SPACE - 8;
      fields.candidateSignature = { page: pageIndex(), x: MARGIN_X, y, w: SIGN_LINE_W, h: SIGN_SPACE - 4 };
      page.drawLine({ start: { x: MARGIN_X, y }, end: { x: MARGIN_X + SIGN_LINE_W, y }, thickness: 0.8, color: INK });
      y -= 4;
      drawBody(acceptBody, true);
      y += PARA_GAP;

      const dateLabel = "Date: ";
      page.drawText(dateLabel, { x: MARGIN_X, y: y - BODY_SIZE, size: BODY_SIZE, font: fonts.regular, color: INK });
      const dx = MARGIN_X + fonts.regular.widthOfTextAtSize(dateLabel, BODY_SIZE);
      page.drawLine({ start: { x: dx, y: y - BODY_SIZE - 2 }, end: { x: dx + 140, y: y - BODY_SIZE - 2 }, thickness: 0.8, color: INK });
      fields.candidateDate = { page: pageIndex(), x: dx, y: y - BODY_SIZE - 2, w: 140, h: 16 };
      y -= LINE_H + PARA_GAP;
      continue;
    }

    if (s.title) {
      // Keep the heading with at least two lines of its text.
      ensure(HEADING_BEFORE + LINE_H + LINE_H * 2);
      drawHeading(fill(s.title));
    }
    drawBody(s.body);
    if (s.kind === "commission" && input.commission) {
      const tables = commissionTables(input.commission, parseMoneyCents(input.values.salary), input.values.title ?? "");
      for (const t of tables) drawTable(t);
    }
  }

  function cellLines(text: string, font: PDFFont, width: number) {
    return wrap([{ text: clean(text), font }], width - CELL_PAD * 2, TABLE_SIZE);
  }

  /** One bordered table. Rows never split; the header row repeats on a new page. */
  function drawTable(t: CommissionTable) {
    const colW = TEXT_W / t.columns.length;
    const rowH = (cells: string[], font: PDFFont) =>
      Math.max(...cells.map((c) => cellLines(c, font, colW).length)) * TABLE_LINE_H + CELL_PAD * 2;
    const headerH = rowH(t.columns, fonts.bold);
    const firstRowH = t.rows.length ? rowH(t.rows[0], fonts.regular) : 0;

    // Heading, note, header row and first row stay together.
    const introH =
      (t.heading ? LINE_H : 0) +
      (t.note ? wrap([{ text: clean(t.note), font: fonts.bold }], TEXT_W, BODY_SIZE).length * LINE_H : 0) +
      (t.heading || t.note ? 6 : 0);
    ensure(introH + headerH + firstRowH);
    if (t.heading) drawRuns([{ text: clean(t.heading), font: fonts.bold }], MARGIN_X);
    if (t.note) drawRuns([{ text: clean(t.note), font: fonts.bold }], MARGIN_X);
    if (t.heading || t.note) y -= 6;

    const drawRow = (cells: string[], font: PDFFont, h: number) => {
      cells.forEach((cell, i) => {
        const x = MARGIN_X + i * colW;
        page.drawRectangle({ x, y: y - h, width: colW, height: h, borderColor: INK, borderWidth: 0.6 });
        cellLines(cell, font, colW).forEach((line, j) => {
          let cx = x + CELL_PAD;
          for (const seg of line) {
            page.drawText(seg.text, { x: cx, y: y - CELL_PAD - TABLE_SIZE - j * TABLE_LINE_H + 1, size: TABLE_SIZE, font: seg.font, color: INK });
            cx += seg.font.widthOfTextAtSize(seg.text, TABLE_SIZE);
          }
        });
      });
      y -= h;
    };

    drawRow(t.columns, fonts.bold, headerH);
    for (const row of t.rows) {
      const h = rowH(row, fonts.regular);
      if (y - h < BOTTOM) {
        newPage();
        drawRow(t.columns, fonts.bold, headerH);
      }
      drawRow(row, fonts.regular, h);
    }
    y -= PARA_GAP + 8;
  }

  function drawHeading(text: string) {
    if (y < TOP) y -= HEADING_BEFORE;
    page.drawText(text, { x: MARGIN_X, y: y - HEADING_SIZE, size: HEADING_SIZE, font: fonts.bold, color: INK });
    y -= HEADING_SIZE + 8;
  }

  const bytes = await doc.save();
  return { bytes, pageCount: doc.getPageCount(), fields };
}

function drawLogo(page: PDFPage, logo: PDFImage) {
  const w = 110;
  const h = (logo.height / logo.width) * w;
  page.drawImage(logo, { x: PAGE_W - MARGIN_X - w + 8, y: PAGE_H - 36 - h, width: w, height: h });
}

/** Greedy word wrap over mixed-font segments. Spaces at the start of a wrapped line are dropped. */
function wrap(segs: Seg[], maxW: number, size: number): Seg[][] {
  const lines: Seg[][] = [];
  let line: Seg[] = [];
  let width = 0;
  const push = () => {
    // Trailing spaces don't count toward the line and aren't drawn.
    while (line.length && !line[line.length - 1].text.trim()) line.pop();
    lines.push(line);
    line = [];
    width = 0;
  };
  for (const seg of segs) {
    for (const piece of seg.text.split(/(\s+)/)) {
      if (!piece) continue;
      const isSpace = !piece.trim();
      if (isSpace && line.length === 0) continue;
      const text = isSpace ? " " : piece;
      const w = seg.font.widthOfTextAtSize(text, size);
      if (!isSpace && width + w > maxW && line.length) push();
      const last = line[line.length - 1];
      if (last && last.font === seg.font) last.text += text;
      else line.push({ text, font: seg.font });
      width += w;
    }
  }
  if (line.length || lines.length === 0) push();
  return lines;
}
