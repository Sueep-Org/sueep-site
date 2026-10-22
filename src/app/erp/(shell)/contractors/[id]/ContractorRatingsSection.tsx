"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { StarInput, Stars } from "@/app/erp/components/Stars";
import { PRICING_SCORE_HELP, RATING_KEYS, RATING_LABELS, type RatingKey, type SubScores } from "@/lib/erp/subScores";

export type RatingRow = {
  id: string;
  createdAt: string;
  projectId: string | null;
  projectTitle: string | null;
  quality: number;
  reliability: number;
  communication: number;
  note: string | null;
  ratedBy: string;
  canDelete: boolean;
};

type Override = { note: string | null; by: string | null; at: string | null };

/** Ratings tab on the contractor profile: the two scores, a way to rate, and every past rating. */
export function ContractorRatingsSection({
  contractorId,
  scores,
  ratings,
  projectOptions,
  override,
}: {
  contractorId: string;
  scores: SubScores | null;
  ratings: RatingRow[];
  projectOptions: { id: string; jobTitle: string }[];
  override: Override;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [rateOpen, setRateOpen] = useState(false);
  const [values, setValues] = useState<Record<RatingKey, number | null>>({ quality: null, reliability: null, communication: null });
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingValue, setPricingValue] = useState<number | null>(null);
  const [pricingNote, setPricingNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function send(url: string, method: string, body?: unknown): Promise<boolean> {
    setSaving(true);
    setError("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      toast(data.error ?? "Could not save.");
      return false;
    }
    router.refresh();
    return true;
  }

  function openRate() {
    setValues({ quality: null, reliability: null, communication: null });
    setProjectId("");
    setNote("");
    setError("");
    setRateOpen(true);
  }

  async function saveRating() {
    if (RATING_KEYS.some((k) => values[k] == null)) {
      setError("Rate all three.");
      return;
    }
    if (await send(`/api/erp/contractors/${contractorId}/ratings`, "POST", { ...values, projectId: projectId || null, note })) setRateOpen(false);
  }

  async function deleteRating(r: RatingRow) {
    const ok = await confirm({ title: "Delete this rating?", message: `From ${r.ratedBy} on ${r.createdAt.slice(0, 10)}.`, confirmLabel: "Delete" });
    if (ok) await send(`/api/erp/contractors/${contractorId}/ratings/${r.id}`, "DELETE");
  }

  function openPricing() {
    setPricingValue(scores?.pricingOverride ?? scores?.pricingAuto ?? null);
    setPricingNote(override.note ?? "");
    setError("");
    setPricingOpen(true);
  }

  async function savePricing(action: "set" | "clear") {
    if (action === "set" && pricingValue == null) {
      setError("Pick a score.");
      return;
    }
    const override = action === "set" ? pricingValue : null;
    if (await send(`/api/erp/contractors/${contractorId}/pricing-score`, "PATCH", { override, note: pricingNote })) setPricingOpen(false);
  }

  const pricingSource =
    scores?.pricingOverride != null
      ? `Set by hand${override.by ? ` by ${override.by}` : ""}${override.at ? ` on ${override.at.slice(0, 10)}` : ""}`
      : scores?.pricingAuto != null
        ? "Average of the parts below"
        : "No bids or paid jobs yet";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-gray-200 p-3">
          <p className="flex items-center gap-1 text-xs text-gray-500">
            Confidence
            <InfoTip text="Average of everyone's ratings on quality, reliability and communication." wide />
          </p>
          <p className="mt-1">
            <Stars value={scores?.confidence ?? null} size="lg" emptyText="No ratings yet" />
          </p>
          <div className="mt-1 space-y-0.5 text-xs text-gray-600">
            {RATING_KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between">
                <span>{RATING_LABELS[k]}</span>
                <Stars value={scores?.[k] ?? null} size="xs" />
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            {scores?.ratingCount ? `${scores.ratingCount} rating${scores.ratingCount === 1 ? "" : "s"}` : "No ratings yet"}
          </p>
        </div>

        <div className="rounded-md border border-gray-200 p-3">
          <p className="flex items-center gap-1 text-xs text-gray-500">
            Pricing
            <InfoTip text={PRICING_SCORE_HELP} wide />
          </p>
          <p className="mt-1">
            <Stars value={scores?.pricing ?? null} size="lg" emptyText="No score yet" />
          </p>
          <p className="mt-1 text-xs text-gray-600">{pricingSource}</p>
          {scores?.pricingOverride != null && override.note ? <p className="mt-0.5 text-xs italic text-gray-500">{override.note}</p> : null}
          {scores?.pricingOverride != null && scores.pricingAuto != null ? (
            <p className="mt-0.5 text-[11px] text-gray-400">Worked out it would be <Stars value={scores.pricingAuto} size="xs" /></p>
          ) : null}
          <div className="mt-1 space-y-0.5 text-xs text-gray-600">
            <div className="flex items-center justify-between gap-2">
              <span>Vs other subs</span>
              <span>
                <Stars value={scores?.vsOthersScore ?? null} size="xs" />
                {scores?.comparedBids ? <span className="text-gray-400"> ({plural(scores.comparedBids, "bid")})</span> : null}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Margin kept</span>
              <span>
                <Stars value={scores?.marginScore ?? null} size="xs" />
                {scores?.avgMarginPct != null ? (
                  <span className="text-gray-400"> ({Math.round(scores.avgMarginPct)}% avg, {plural(scores.marginJobs.length, "job")})</span>
                ) : null}
              </span>
            </div>
          </div>
          {scores?.marginJobs.length ? (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Jobs counted</summary>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
                {[...scores.marginJobs]
                  .sort((a, b) => a.projectTitle.localeCompare(b.projectTitle))
                  .map((j) => (
                    <li key={`${j.source}:${j.projectId}`} className="flex justify-between gap-2">
                      <Link href={`/erp/projects/${j.projectId}`} className="truncate text-gray-700 hover:text-pink-600 hover:underline">
                        {j.projectTitle}
                      </Link>
                      <span className="shrink-0 text-gray-500" title={j.source === "bid" ? "Their awarded bid's margin" : "The whole job's labor margin"}>
                        {Math.round(j.marginPct)}%{j.source === "bid" ? " (bid)" : ""}
                      </span>
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
          <Button variant="ghost" size="xs" className="mt-1" onClick={openPricing}>
            {scores?.pricingOverride != null ? "Change" : "Set by hand"}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Ratings</p>
        <Button size="sm" onClick={openRate}>Rate this sub</Button>
      </div>

      {ratings.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No ratings yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">By</th>
                <th className="px-3 py-2 font-medium">Job</th>
                {RATING_KEYS.map((k) => (
                  <th key={k} className="px-3 py-2 text-center font-medium">{RATING_LABELS[k]}</th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800">
              {ratings.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2">{r.createdAt.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1">
                      {r.ratedBy}
                      {r.note ? <InfoTip text={r.note} wide /> : null}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2">
                    {r.projectId ? (
                      <Link href={`/erp/projects/${r.projectId}`} className="hover:text-pink-600 hover:underline">{r.projectTitle}</Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  {RATING_KEYS.map((k) => (
                    <td key={k} className="px-3 py-2 text-center"><Stars value={r[k]} size="xs" /></td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    {r.canDelete ? (
                      <Button variant="ghost" size="xs" onClick={() => deleteRating(r)}>Delete</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={rateOpen} onClose={() => setRateOpen(false)} size="md">
        <div className="space-y-3">
          <p className="text-base font-semibold text-gray-900">Rate this sub</p>
          {RATING_KEYS.map((k) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700">{RATING_LABELS[k]}</span>
              <StarInput value={values[k]} onChange={(v) => setValues((prev) => ({ ...prev, [k]: v }))} />
            </div>
          ))}
          <p className="text-[11px] text-gray-400">1 star is poor, 5 is great.</p>
          <div>
            <label className={labelClass.default}>Job (optional)</label>
            <div className="mt-1">
              <SearchableSelect
                value={projectId}
                onChange={setProjectId}
                options={projectOptions.map((p) => ({ value: p.id, label: p.jobTitle }))}
                placeholder="Search their jobs"
                allLabel="No job"
              />
            </div>
          </div>
          <div>
            <label className={labelClass.default}>Note</label>
            <textarea className={inputClass.md} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRateOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={saveRating} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={pricingOpen} onClose={() => setPricingOpen(false)} size="md">
        <div className="space-y-3">
          <p className="text-base font-semibold text-gray-900">Pricing score</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700">Score</span>
            <StarInput value={pricingValue} onChange={setPricingValue} />
          </div>
          <p className="text-[11px] text-gray-400">
            {scores?.pricingAuto != null ? (
              <>Worked out from their bids and jobs: <Stars value={scores.pricingAuto} size="xs" /></>
            ) : (
              "No bids or paid jobs to work one out from yet."
            )}
          </p>
          <div>
            <label className={labelClass.default}>Why (optional)</label>
            <textarea className={inputClass.md} rows={2} value={pricingNote} onChange={(e) => setPricingNote(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex items-center justify-between gap-2">
            {scores?.pricingOverride != null ? (
              <Button variant="ghost" size="xs" onClick={() => savePricing("clear")} disabled={saving}>Use bids instead</Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPricingOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={() => savePricing("set")} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
