import { NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { loadDashboardPrefs, resetDashboardPrefs, saveDashboardPrefs } from "@/lib/erp/dashboardPrefs";

export const runtime = "nodejs";

/** The caller's own dashboard layout. Always keyed by the login email, never by anything in the request. */
export async function GET() {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ prefs: await loadDashboardPrefs(auth.email) });
}

/** Saves `{ hiddenCards?, cardOrder?, startTab? }`, or `{ reset: true }` for the role default. */
export async function PUT(req: Request) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (body.reset === true) return NextResponse.json({ prefs: await resetDashboardPrefs(auth.email) });

  const input: { hiddenCards?: unknown; cardOrder?: unknown; startTab?: unknown } = {};
  if ("hiddenCards" in body) input.hiddenCards = body.hiddenCards;
  if ("cardOrder" in body) input.cardOrder = body.cardOrder;
  if ("startTab" in body) input.startTab = body.startTab;
  if (!Object.keys(input).length) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });

  return NextResponse.json({ prefs: await saveDashboardPrefs(auth.email, input) });
}
