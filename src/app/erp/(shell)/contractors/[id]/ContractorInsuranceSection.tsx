"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subFieldName, type SubField } from "@/lib/erp/subcontractorQuestionnaire";
import { subFieldInput } from "../../candidates/[id]/subcontractorFieldUi";
import { InfoTip, inputClass, labelClass } from "@/app/erp/components/ui";
import { SUB_STATUS_STYLE, subCoverage } from "@/lib/erp/subCoverage";
import { formatLimit } from "@/lib/erp/insurance";

const input = inputClass.md;
const label = labelClass.default;

type Initial = {
  hasInsurance: boolean | null;
  workersCompCarrier: string | null;
  workersCompPolicyNumber: string | null;
  workersCompExpiresAt: string | null;
  workersCompExempt: boolean;
  glCarrier: string | null;
  glPolicyNumber: string | null;
  glExpiresAt: string | null;
  glOccurrenceCents: number | null;
  glAggregateCents: number | null;
  autoExpiresAt: string | null;
  autoLimitCents: number | null;
  umbrellaExpiresAt: string | null;
  umbrellaLimitCents: number | null;
  sueepAdditionalInsured: boolean | null;
  sueepWaiverOfSubrogation: boolean | null;
  sueepPrimaryNoncontributory: boolean | null;
  coiReviewedAt: string | null;
  coiReviewedBy: string | null;
};

type Props = {
  contractorId: string;
  initial: Initial;
  workersCompDoc: { id: string; filename: string } | null;
  /** The questionnaire's "insurance" section fields, kept as free-text notes
   * below the structured policies. */
  questionnaireFields: SubField[];
  /** True when a CandidateApplication is linked, so some of initialValues
   * came from it. Only changes the helper text; the fields stay editable. */
  fromApplication: boolean;
  /** sub_<key>-keyed values: what's saved on the contractor, falling back
   * to the linked application's answer for fields never edited here. */
  initialValues: Record<string, string>;
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const dollars = (c: number | null) => (c == null ? "" : String(c / 100));
const toDate = (v: string) => (v ? new Date(`${v}T00:00:00Z`) : null);

/** Yes / No / Not checked, for what their certificate says about Sueep. */
function TriState({ name, value, onChange, text }: { name: string; value: boolean | null; onChange: (v: boolean | null) => void; text: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="w-48 text-gray-700">{text}</span>
      {([
        [true, "Yes"],
        [false, "No"],
        [null, "Not checked"],
      ] as const).map(([v, t]) => (
        <label key={t} className="flex cursor-pointer items-center gap-1.5">
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} className="accent-pink-600" />
          <span className="text-gray-600">{t}</span>
        </label>
      ))}
    </div>
  );
}

/** The sub's insurance: their policies and dates, what their certificate
 * says about Sueep, and an overall Valid / Expiring / Expired / Missing
 * status. The certificate itself is uploaded via Documents below. */
export function ContractorInsuranceSection({ contractorId, initial, workersCompDoc, questionnaireFields, fromApplication, initialValues }: Props) {
  const router = useRouter();
  const [hasInsurance, setHasInsurance] = useState<boolean | null>(initial.hasInsurance);
  const [f, setF] = useState({
    workersCompCarrier: initial.workersCompCarrier ?? "",
    workersCompPolicyNumber: initial.workersCompPolicyNumber ?? "",
    workersCompExpiresAt: day(initial.workersCompExpiresAt),
    workersCompExempt: initial.workersCompExempt,
    glCarrier: initial.glCarrier ?? "",
    glPolicyNumber: initial.glPolicyNumber ?? "",
    glExpiresAt: day(initial.glExpiresAt),
    glOccurrenceCents: dollars(initial.glOccurrenceCents),
    glAggregateCents: dollars(initial.glAggregateCents),
    autoExpiresAt: day(initial.autoExpiresAt),
    autoLimitCents: dollars(initial.autoLimitCents),
    umbrellaExpiresAt: day(initial.umbrellaExpiresAt),
    umbrellaLimitCents: dollars(initial.umbrellaLimitCents),
    sueepAdditionalInsured: initial.sueepAdditionalInsured,
    sueepWaiverOfSubrogation: initial.sueepWaiverOfSubrogation,
    sueepPrimaryNoncontributory: initial.sueepPrimaryNoncontributory,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [questionnaireValues, setQuestionnaireValues] = useState<Record<string, string>>(initialValues);
  const [markReviewed, setMarkReviewed] = useState(false);
  const [certDoc, setCertDoc] = useState(workersCompDoc);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certError, setCertError] = useState("");

  // Uploads right away, separate from Save, like the Documents checklist.
  async function uploadCertificate(file: File) {
    setUploadingCert(true);
    setCertError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/erp/contractors/${contractorId}/insurance-certificate`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { id?: string; filename?: string; error?: string };
      if (!res.ok || !data.id) {
        setCertError(res.status === 413 ? "File too large (max 4 MB)" : data.error ?? "Upload failed");
        return;
      }
      setCertDoc({ id: data.id, filename: data.filename ?? file.name });
      router.refresh();
    } catch {
      setCertError("Network error");
    } finally {
      setUploadingCert(false);
    }
  }
  // Read-only summary first; the form only when editing. Starts in edit
  // mode when nothing has been entered yet.
  const [editing, setEditing] = useState(initial.hasInsurance == null && !initial.glExpiresAt && !initial.workersCompExpiresAt && !initial.workersCompExempt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // Live status from what's in the form, so it updates as dates are typed.
  const coverage = subCoverage({
    hasInsurance,
    workersCompExpiresAt: toDate(f.workersCompExpiresAt),
    workersCompExempt: f.workersCompExempt,
    glExpiresAt: toDate(f.glExpiresAt),
    autoExpiresAt: toDate(f.autoExpiresAt),
    umbrellaExpiresAt: toDate(f.umbrellaExpiresAt),
  });
  const style = SUB_STATUS_STYLE[coverage.status];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOk("");
    try {
      const body: Record<string, unknown> = {
        hasInsurance,
        ...f,
        workersCompCarrier: f.workersCompCarrier || null,
        workersCompPolicyNumber: f.workersCompPolicyNumber || null,
        workersCompExpiresAt: f.workersCompExempt ? null : f.workersCompExpiresAt || null,
        glExpiresAt: f.glExpiresAt || null,
        autoExpiresAt: f.autoExpiresAt || null,
        umbrellaExpiresAt: f.umbrellaExpiresAt || null,
        markCoiReviewed: markReviewed,
        // Only fields actually changed are saved on the contractor, so
        // untouched ones keep following the linked application (if any).
        manualApplicationInfo: Object.fromEntries(Object.entries(questionnaireValues).filter(([k, v]) => v !== (initialValues[k] ?? ""))),
      };
      const res = await fetch(`/api/erp/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      setOk("Insurance info updated.");
      setMarkReviewed(false);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const text = (k: keyof typeof f, t: string, opts: { type?: string; money?: boolean; disabled?: boolean } = {}) => (
    <div>
      <label className={label} htmlFor={`ins-${k}`}>{t}</label>
      <input
        id={`ins-${k}`}
        type={opts.type ?? "text"}
        inputMode={opts.money ? "decimal" : undefined}
        placeholder={opts.money ? "$" : undefined}
        value={f[k] as string}
        disabled={opts.disabled}
        onChange={(e) => set(k, e.target.value as never)}
        className={`${input} disabled:bg-gray-50 disabled:text-gray-400`}
      />
    </div>
  );
  const heading = (t: string, tip?: string) => (
    <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {t} {tip && <InfoTip text={tip} />}
    </h3>
  );

  const statusBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.cls}`}>{style.label}</span>
        <span className="text-sm text-gray-700">{coverage.summary}</span>
        <InfoTip text="Until Sueep sets minimum requirements for subs, general liability and workers' comp (or an exemption) are required. Auto and umbrella count once a date is entered." />
      </div>
      <span className="text-xs text-gray-500">
        {initial.coiReviewedAt
          ? `Checked ${new Date(initial.coiReviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}${initial.coiReviewedBy ? ` by ${initial.coiReviewedBy}` : ""}`
          : "Certificate not checked yet"}
      </span>
    </div>
  );

  if (!editing) {
    const fmt = (iso: string | null) =>
      iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
    const line = (parts: (string | null | false)[]) => parts.filter(Boolean).join(" · ") || "Not entered";
    const rows: [string, string][] = [
      [
        "General liability",
        line([
          initial.glCarrier,
          initial.glOccurrenceCents != null || initial.glAggregateCents != null ? `${formatLimit(initial.glOccurrenceCents)} / ${formatLimit(initial.glAggregateCents)}` : null,
          initial.glExpiresAt && `expires ${fmt(initial.glExpiresAt)}`,
        ]),
      ],
      ["Workers' comp", initial.workersCompExempt ? "Exempt" : line([initial.workersCompCarrier, initial.workersCompExpiresAt && `expires ${fmt(initial.workersCompExpiresAt)}`])],
    ];
    if (initial.autoExpiresAt || initial.autoLimitCents != null) {
      rows.push(["Auto", line([initial.autoLimitCents != null && formatLimit(initial.autoLimitCents), initial.autoExpiresAt && `expires ${fmt(initial.autoExpiresAt)}`])]);
    }
    if (initial.umbrellaExpiresAt || initial.umbrellaLimitCents != null) {
      rows.push(["Umbrella", line([initial.umbrellaLimitCents != null && formatLimit(initial.umbrellaLimitCents), initial.umbrellaExpiresAt && `expires ${fmt(initial.umbrellaExpiresAt)}`])]);
    }
    const mark = (v: boolean | null) => (v === true ? "✓" : v === false ? "✗" : "–");
    rows.push([
      "Sueep listed",
      `Additional insured ${mark(initial.sueepAdditionalInsured)}   Waiver ${mark(initial.sueepWaiverOfSubrogation)}   P&NC ${mark(initial.sueepPrimaryNoncontributory)}`,
    ]);

    return (
      <div className="space-y-4">
        {statusBar}
        <dl className="space-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[9rem_1fr] gap-3">
              <dt className="text-gray-500">{k}</dt>
              <dd className="whitespace-pre text-gray-900">{v}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[9rem_1fr] gap-3">
            <dt className="text-gray-500">Certificate</dt>
            <dd>
              {certDoc ? (
                <a href={`/api/erp/contractors/${contractorId}/documents/${certDoc.id}`} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">
                  {certDoc.filename}
                </a>
              ) : (
                <span className="text-gray-400">Not uploaded</span>
              )}
            </dd>
          </div>
        </dl>
        {ok ? <p className="text-xs text-emerald-600">{ok}</p> : null}
        <button type="button" onClick={() => { setOk(""); setEditing(true); }} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Edit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {statusBar}

      <div>
        <label className={label}>Has insurance</label>
        <div className="mt-1 flex gap-4">
          {(["yes", "no", "unknown"] as const).map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="hasInsurance"
                checked={opt === "yes" ? hasInsurance === true : opt === "no" ? hasInsurance === false : hasInsurance === null}
                onChange={() => setHasInsurance(opt === "yes" ? true : opt === "no" ? false : null)}
                className="accent-pink-600"
              />
              <span className="text-gray-700">{opt === "unknown" ? "Unknown" : opt.charAt(0).toUpperCase() + opt.slice(1)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {heading("General liability")}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {text("glCarrier", "Carrier")}
          {text("glPolicyNumber", "Policy number")}
          {text("glOccurrenceCents", "Each occurrence", { money: true })}
          {text("glAggregateCents", "Aggregate", { money: true })}
          {text("glExpiresAt", "Expires", { type: "date" })}
        </div>
      </div>

      <div className="space-y-3">
        {heading("Workers' comp")}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {text("workersCompCarrier", "Carrier", { disabled: f.workersCompExempt })}
          {text("workersCompPolicyNumber", "Policy number", { disabled: f.workersCompExempt })}
          {text("workersCompExpiresAt", "Expires", { type: "date", disabled: f.workersCompExempt })}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={f.workersCompExempt} onChange={(e) => set("workersCompExempt", e.target.checked)} className="h-4 w-4 text-pink-600" />
          Exempt
          <InfoTip text="Solo sub with no employees and no workers' comp policy. Upload their exemption form under Documents. What counts as proof is still being confirmed with Pie." />
        </label>
      </div>

      <div className="space-y-3">
        {heading("Auto and umbrella", "Only needed if they carry them or a job requires them.")}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {text("autoLimitCents", "Auto limit", { money: true })}
          {text("autoExpiresAt", "Auto expires", { type: "date" })}
          {text("umbrellaLimitCents", "Umbrella limit", { money: true })}
          {text("umbrellaExpiresAt", "Umbrella expires", { type: "date" })}
        </div>
      </div>

      <div className="space-y-2">
        {heading("Sueep on their certificate", "What their COI shows in Sueep's favor. Look for Sueep as certificate holder and Y in the ADDL INSD and SUBR WVD columns.")}
        <TriState name="ai" text="Additional insured" value={f.sueepAdditionalInsured} onChange={(v) => set("sueepAdditionalInsured", v)} />
        <TriState name="waiver" text="Waiver of subrogation" value={f.sueepWaiverOfSubrogation} onChange={(v) => set("sueepWaiverOfSubrogation", v)} />
        <TriState name="pnc" text="Primary and noncontributory" value={f.sueepPrimaryNoncontributory} onChange={(v) => set("sueepPrimaryNoncontributory", v)} />
      </div>

      {questionnaireFields.length > 0 && (
        <div className="space-y-3 border-t border-gray-200 pt-4">
          {heading(
            "Questionnaire notes",
            fromApplication
              ? "Pre-filled from the linked subcontractor application. Changes are saved on this contractor only."
              : "Free-text answers from the subcontractor questionnaire.",
          )}
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {questionnaireFields.map((field) => (
              <div key={field.key}>
                <label className={label}>{field.label}</label>
                {subFieldInput(field, questionnaireValues[subFieldName(field.key)] ?? "", (v) =>
                  setQuestionnaireValues((prev) => ({ ...prev, [subFieldName(field.key)]: v })),
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 border-t border-gray-200 pt-4">
        {heading("Certificate of insurance")}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {certDoc ? (
            <a href={`/api/erp/contractors/${contractorId}/documents/${certDoc.id}`} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">
              {certDoc.filename}
            </a>
          ) : (
            <span className="text-gray-400">Not attached</span>
          )}
          <label className={`cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 ${uploadingCert ? "pointer-events-none opacity-50" : ""}`}>
            {uploadingCert ? "Uploading…" : certDoc ? "Replace" : "Attach file"}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadCertificate(file);
                e.target.value = "";
              }}
            />
          </label>
          {certError && <span className="text-xs text-red-500">{certError}</span>}
        </div>
      </div>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {ok ? <p className="text-xs text-emerald-600">{ok}</p> : null}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save insurance info"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={markReviewed} onChange={(e) => setMarkReviewed(e.target.checked)} className="h-4 w-4 text-pink-600" />
          I checked their certificate
          <InfoTip text="Records today's date and your name as the last time someone checked this sub's COI against what's entered here." />
        </label>
      </div>
    </form>
  );
}
