import { NextResponse } from "next/server";
import { getErpAuth, canManageQuickBooks } from "@/lib/erpAuth";
import { parseArAging, parseProfitAndLoss } from "@/lib/erp/qboCsv";
import { saveArImport, savePnlImport } from "@/lib/erp/qboImport";

export const runtime = "nodejs";

/** QuickBooks exports are small; anything this big is the wrong file. */
const MAX_CHARS = 5_000_000;

/**
 * Reads a QuickBooks CSV export. { kind: "PNL" | "AR_AGING", fileName, text,
 * save }. Without save it only returns what was read (the preview). With
 * save it stores it: a P&L replaces the months it covers, an A/R aging
 * replaces that "as of" date.
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageQuickBooks(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { kind?: unknown; fileName?: unknown; text?: unknown; save?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  if (text.length > MAX_CHARS) return NextResponse.json({ error: "That file is too big for a QuickBooks report." }, { status: 400 });
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : null;
  const save = body.save === true;

  if (body.kind === "PNL") {
    const parsed = parseProfitAndLoss(text);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!save) return NextResponse.json({ kind: "PNL", parsed });
    const saved = await savePnlImport(parsed, { source: "UPLOAD", fileName, importedBy: auth.email ?? null });
    return NextResponse.json({ ok: true, importId: saved.id });
  }

  if (body.kind === "AR_AGING") {
    const parsed = parseArAging(text);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!save) return NextResponse.json({ kind: "AR_AGING", parsed });
    const saved = await saveArImport(parsed, { source: "UPLOAD", fileName, importedBy: auth.email ?? null });
    return NextResponse.json({ ok: true, importId: saved.id });
  }

  return NextResponse.json({ error: "Pick Profit and Loss or A/R Aging." }, { status: 400 });
}
