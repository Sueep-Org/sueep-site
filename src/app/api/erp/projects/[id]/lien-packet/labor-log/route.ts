import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { buildCsv, type CsvColumn } from "@/lib/erp/csv";
import { utcDateKey } from "@/lib/erp/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
type Row = { dateKey: string; worker: string; role: string | null; hours: number; task: string | null; changeOrder: string };

/**
 * Every day worked on the project, as a CSV for the lien packet: proof the
 * work was done and when. Hours only, no pay rates, since it leaves the company.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const [labor, coLabor] = await Promise.all([
    prisma.laborEntry.findMany({ where: { projectId: id }, select: { workDate: true, workerName: true, role: true, hours: true, taskDescription: true } }),
    prisma.projectChangeOrderLaborer.findMany({
      where: { changeOrder: { projectId: id } },
      select: { workDate: true, name: true, role: true, hours: true, taskDescription: true, changeOrder: { select: { title: true } } },
    }),
  ]);
  const rows: Row[] = [
    ...labor.map((e) => ({ dateKey: utcDateKey(e.workDate), worker: e.workerName, role: e.role, hours: e.hours, task: e.taskDescription, changeOrder: "" })),
    ...coLabor.map((e) => ({ dateKey: utcDateKey(e.workDate), worker: e.name, role: e.role, hours: e.hours, task: e.taskDescription, changeOrder: e.changeOrder.title })),
  ].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.worker.localeCompare(b.worker));

  const columns: CsvColumn<Row>[] = [
    { header: "Date", get: (r) => r.dateKey },
    { header: "Worker", get: (r) => r.worker },
    { header: "Role", get: (r) => r.role ?? "" },
    { header: "Hours", get: (r) => r.hours.toFixed(2) },
    { header: "Change Order", get: (r) => r.changeOrder },
    { header: "Task", get: (r) => r.task ?? "" },
  ];
  const total = rows.reduce((s, r) => s + r.hours, 0);
  const csv = buildCsv(columns, rows, [["TOTAL", "", "", total.toFixed(2), "", ""]]);
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="labor-log.csv"', "cache-control": "private, no-store" },
  });
}
