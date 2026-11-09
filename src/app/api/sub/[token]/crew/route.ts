import { NextResponse } from "next/server";
import { requireSignedInSub } from "@/lib/erp/subPortalAccess";
import { parseCrewCount, parseCrewNames, setCrew, type CrewDayRef } from "@/lib/erp/subCrew";
import { tr } from "@/lib/erp/language";

type Ctx = { params: Promise<{ token: string }> };

/** The sub sets or changes their crew for a job's days. Body: { days: [{ kind, dayId }], count, names } */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const access = await requireSignedInSub(token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { sub } = access;
  const body = (await req.json().catch(() => null)) as { days?: unknown; count?: unknown; names?: unknown } | null;
  const refs: CrewDayRef[] = Array.isArray(body?.days)
    ? body.days.flatMap((d: unknown) => {
        const r = d as { kind?: unknown; dayId?: unknown };
        return (r.kind === "day" || r.kind === "co-day") && typeof r.dayId === "string" ? [{ kind: r.kind, dayId: r.dayId }] : [];
      })
    : [];
  const count = parseCrewCount(body?.count);
  if (count == null) return NextResponse.json({ error: tr(sub.lang, { en: "Enter how many people, 1 to 50", es: "Escribe cuántas personas, de 1 a 50" }) }, { status: 400 });
  if (refs.length === 0) return NextResponse.json({ error: "No days" }, { status: 400 });
  const result = await setCrew(sub.id, refs, count, parseCrewNames(body?.names), { lang: sub.lang, alert: true });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
