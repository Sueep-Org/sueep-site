"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip } from "@/app/erp/components/ui";
import type { ArParse, PnlParse, PnlSection } from "@/lib/erp/qboCsv";

export type ImportRow = {
  id: string;
  kind: "PNL" | "AR_AGING";
  source: string;
  fileName: string | null;
  importedBy: string | null;
  createdAt: string;
  periodFrom: string | null;
  periodTo: string | null;
  basis: string | null;
  asOf: string | null;
  rowCount: number;
};

type Kind = ImportRow["kind"];
type Preview = { kind: "PNL"; parsed: PnlParse } | { kind: "AR_AGING"; parsed: ArParse };

const KINDS: { key: Kind; label: string; how: string }[] = [
  {
    key: "PNL",
    label: "Profit and Loss",
    how: 'Reports, Profit and Loss. Set the dates (this year so far is fine), set "Display columns by" to Months, Run report, then Export to CSV. Months in the file replace what was uploaded for those months before.',
  },
  {
    key: "AR_AGING",
    label: "A/R Aging Summary",
    how: "Reports, A/R Aging Summary, as of today. Run report, then Export to CSV. A newer upload for the same date replaces it; other dates are kept.",
  },
];

const SECTION_LABELS: Record<PnlSection, string> = {
  INCOME: "Income",
  COGS: "Cost of goods sold",
  EXPENSE: "Expenses",
  OTHER_INCOME: "Other income",
  OTHER_EXPENSE: "Other expenses",
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function QuickBooksUpload({ imports, pnlMonths, ar }: { imports: ImportRow[]; pnlMonths: string[]; ar: { asOf: string; totalCents: number } | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("PNL");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  function reset() {
    setFile(null);
    setPreview(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send(save: boolean, f = file, k = kind) {
    if (!f) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/erp/quickbooks/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: k, fileName: f.name, text: f.text, save }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<Preview>;
      if (!res.ok) {
        setPreview(null);
        setError(data.error || "Couldn't read the file");
        return;
      }
      if (save) {
        setSaved(`${f.name} saved.`);
        reset();
        router.refresh();
      } else setPreview(data as Preview);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    setSaved("");
    setPreview(null);
    if (!picked) return setFile(null);
    const f = { name: picked.name, text: await picked.text() };
    setFile(f);
    send(false, f);
  }

  const mismatches = preview?.kind === "PNL" ? preview.parsed.checks.filter((c) => c.fileCents !== c.linesCents) : [];
  const arOff = preview?.kind === "AR_AGING" && preview.parsed.fileTotalCents != null && preview.parsed.fileTotalCents !== preview.parsed.rowsTotalCents;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-500">Profit and Loss in the ERP</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">
            {pnlMonths.length ? `${monthLabel(pnlMonths[0])} to ${monthLabel(pnlMonths[pnlMonths.length - 1])}` : "Nothing uploaded yet"}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-500">Latest A/R Aging</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">
            {ar ? `${money(ar.totalCents)} owed, as of ${dayLabel(ar.asOf)}` : "Nothing uploaded yet"}
          </p>
        </div>
      </div>

      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Upload a report</h2>
          <div role="tablist" className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                role="tab"
                aria-selected={kind === k.key}
                onClick={() => {
                  setKind(k.key);
                  reset();
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium ${kind === k.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <InfoTip text={KINDS.find((k) => k.key === kind)!.how} wide />
        </div>

        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="block text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-pink-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-pink-700 hover:file:bg-pink-100" />

        {busy && !preview ? <p className="text-xs text-gray-500">Reading…</p> : null}
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        {saved ? <p className="text-sm text-emerald-700">{saved}</p> : null}

        {preview?.kind === "PNL" ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              {preview.parsed.periodFrom && preview.parsed.periodTo ? `${dayLabel(preview.parsed.periodFrom)} to ${dayLabel(preview.parsed.periodTo)}` : "Dates not found"}
              {preview.parsed.basis ? `, ${preview.parsed.basis === "CASH" ? "cash" : "accrual"} basis` : ""}. {preview.parsed.months.length} months,{" "}
              {new Set(preview.parsed.lines.map((l) => `${l.parent}|${l.account}`)).size} accounts.
            </p>
            {mismatches.length ? (
              <p className="text-sm text-red-600">
                {mismatches.length} total{mismatches.length === 1 ? "" : "s"} don&apos;t match the file. Check the export before saving.
              </p>
            ) : (
              <p className="text-sm text-emerald-700">Every month&apos;s totals match the file.</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="text-gray-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Month</th>
                    {[...new Set(preview.parsed.checks.map((c) => c.label as PnlSection))].map((sec) => (
                      <th key={sec} className="py-1 pr-3 text-right font-medium">{SECTION_LABELS[sec]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.parsed.months.map((m) => (
                    <tr key={m}>
                      <td className="py-1 pr-3 text-gray-700">{monthLabel(m)}</td>
                      {[...new Set(preview.parsed.checks.map((c) => c.label))].map((sec) => {
                        const c = preview.parsed.checks.find((x) => x.month === m && x.label === sec);
                        return (
                          <td key={sec} className={`py-1 pr-3 text-right tabular-nums ${c && c.fileCents !== c.linesCents ? "text-red-600" : "text-gray-900"}`}>
                            {c ? money(c.linesCents) : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {preview?.kind === "AR_AGING" ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              As of {dayLabel(preview.parsed.asOf)}. {preview.parsed.rows.length} customers, {money(preview.parsed.rowsTotalCents)} owed in total.
            </p>
            {arOff ? (
              <p className="text-sm text-red-600">The customers add up to {money(preview.parsed.rowsTotalCents)}, but the file says {money(preview.parsed.fileTotalCents!)}. Check the export before saving.</p>
            ) : (
              <p className="text-sm text-emerald-700">The total matches the file.</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="text-gray-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Customer</th>
                    <th className="py-1 pr-3 text-right font-medium">Current</th>
                    <th className="py-1 pr-3 text-right font-medium">1-30</th>
                    <th className="py-1 pr-3 text-right font-medium">31-60</th>
                    <th className="py-1 pr-3 text-right font-medium">61-90</th>
                    <th className="py-1 pr-3 text-right font-medium">91+</th>
                    <th className="py-1 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.parsed.rows.map((r) => (
                    <tr key={`${r.parent}|${r.customer}`}>
                      <td className="py-1 pr-3 text-gray-900">{r.parent ? <span className="pl-3 text-gray-600">{r.customer}</span> : r.customer}</td>
                      {[r.currentCents, r.days1to30Cents, r.days31to60Cents, r.days61to90Cents, r.over90Cents].map((v, i) => (
                        <td key={i} className={`py-1 pr-3 text-right tabular-nums ${v < 0 ? "text-red-600" : "text-gray-700"}`}>{v ? money(v) : ""}</td>
                      ))}
                      <td className={`py-1 text-right tabular-nums font-medium ${r.totalCents < 0 ? "text-red-600" : "text-gray-900"}`}>{money(r.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {preview ? (
          <div className="flex gap-2">
            <Button size="xs" type="button" onClick={() => send(true)} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button size="xs" variant="secondary" type="button" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="px-4 pt-3 text-sm font-semibold text-gray-900">Recent uploads</h2>
        {imports.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">None yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Report</th>
                  <th className="px-4 py-2 font-medium">Covers</th>
                  <th className="px-4 py-2 font-medium">File</th>
                  <th className="px-4 py-2 font-medium">By</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {imports.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2 text-gray-900">{i.kind === "PNL" ? "Profit and Loss" : "A/R Aging"}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {i.kind === "PNL"
                        ? i.periodFrom && i.periodTo ? `${dayLabel(i.periodFrom)} to ${dayLabel(i.periodTo)}` : "-"
                        : i.asOf ? `As of ${dayLabel(i.asOf)}` : "-"}
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-2 text-gray-500" title={i.fileName ?? undefined}>{i.source === "SYNC" ? "QuickBooks sync" : i.fileName ?? "-"}</td>
                    <td className="px-4 py-2 text-gray-500">{i.importedBy?.split("@")[0] ?? "-"}</td>
                    <td className="px-4 py-2 text-gray-500">{new Date(i.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
