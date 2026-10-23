"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { OFFER_LETTER_STATUSES, missingOfferBlanks, usedBlanks, type OfferSection } from "@/lib/erp/offerLetters";
import { parseMoneyCents, type CommissionPlan } from "@/lib/erp/offerCommission";
import { CommissionFields } from "../../offer-templates/CommissionFields";
import { SendOfferModal, UploadSignedModal } from "./OfferLetterActions";

export type BuilderTemplate = { id: string; name: string; description: string | null; sections: OfferSection[]; commission: CommissionPlan };

export type BuilderLetter = {
  id: string;
  status: string;
  templateName: string | null;
  values: Record<string, string>;
  sections: OfferSection[];
  commission: CommissionPlan;
  sentAt: string | null;
  sentBy: string | null;
  signedAt: string | null;
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function sectionLabel(s: OfferSection) {
  if (s.kind === "signature") return "Signatures";
  if (s.title) return s.title;
  const t = s.body.replace(/\*\*|\{|\}/g, "").replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 48)}…` : t || "Untitled section";
}

/** Make or edit one offer letter: pick a template, fill the blanks, pick sections, watch the PDF update. */
export function OfferLetterBuilder({
  candidate,
  templates,
  letter,
  defaults,
  initialTemplateId,
  salaryHint,
}: {
  candidate: { id: string; fullName: string; email: string | null };
  templates: BuilderTemplate[];
  letter: BuilderLetter | null;
  defaults: Record<string, string>;
  initialTemplateId: string | null;
  salaryHint: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const readOnly = !!letter && letter.status !== "DRAFT";

  const [templateId, setTemplateId] = useState(letter ? "" : (initialTemplateId ?? (templates.length === 1 ? templates[0].id : "")));
  const template = templates.find((t) => t.id === templateId) ?? null;
  // A saved letter keeps the wording it was made with; a new one follows the picked template.
  const baseSections = useMemo(() => (letter ? letter.sections : (template?.sections ?? [])), [letter, template]);

  const [values, setValues] = useState<Record<string, string>>(letter ? { ...defaults, ...letter.values } : defaults);
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(baseSections.filter((s) => s.enabled).map((s) => s.key)),
  );
  const [commission, setCommission] = useState<CommissionPlan | null>(letter ? letter.commission : (template?.commission ?? null));
  const [dirty, setDirty] = useState(!letter);
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    setIncluded(new Set((t?.sections ?? []).filter((s) => s.enabled).map((s) => s.key)));
    setCommission(t?.commission ?? null);
    setDirty(true);
  }

  const sections = useMemo(() => baseSections.map((s) => ({ ...s, enabled: included.has(s.key) })), [baseSections, included]);
  const hasCommission = sections.some((s) => s.enabled && s.kind === "commission");
  // With commission tables the rate blank follows the commission rate, so it isn't typed in.
  const blanks = useMemo(
    () => usedBlanks(sections).filter((b) => !(hasCommission && b.key === "commissionRate")),
    [sections, hasCommission],
  );
  const emptyBlanks = blanks.filter((b) => !values[b.key]?.trim());

  useEffect(() => {
    if (!dirty || readOnly) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, readOnly]);

  // Rebuild the PDF a moment after the last change.
  const previewKey = JSON.stringify({ templateId, values, included: [...included].sort(), commission });
  useEffect(() => {
    // Sent and signed letters show the copy on file, not a fresh print.
    if (readOnly) {
      setPdfUrl(`/api/erp/candidates/${candidate.id}/offer-letters/${letter!.id}/pdf`);
      return;
    }
    if (!letter && !templateId) {
      setPdfUrl(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      const res = await fetch(`/api/erp/candidates/${candidate.id}/offer-letters/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(letter ? { letterId: letter.id } : { templateId }), values, included: [...included], commission }),
      }).catch(() => null);
      if (cancelled) return;
      setLoadingPreview(false);
      if (!res?.ok) {
        const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
        setPreviewError(data?.error || "Could not build the preview");
        return;
      }
      setPreviewError("");
      url = URL.createObjectURL(await res.blob());
      if (!cancelled) setPdfUrl(url);
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 30_000);
    };
    // previewKey stands in for templateId, values and included.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, candidate.id, letter, readOnly]);

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
    setDirty(true);
  }

  function toggleSection(key: string, on: boolean) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    const res = await fetch(
      letter ? `/api/erp/candidates/${candidate.id}/offer-letters/${letter.id}` : `/api/erp/candidates/${candidate.id}/offer-letters`,
      {
        method: letter ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId, values, included: [...included], commission }),
      },
    ).catch(() => null);
    setSaving(false);
    const data = (await res?.json().catch(() => ({}))) as { id?: string; error?: string } | undefined;
    if (!res?.ok) {
      toast(data?.error || "Could not save", "error");
      return false;
    }
    setDirty(false);
    toast("Draft saved.");
    if (!letter && data?.id) router.replace(`/erp/candidates/${candidate.id}/offer-letter/${data.id}`);
    else router.refresh();
    return true;
  }

  async function openSend() {
    if (dirty && !(await save())) return;
    setSendOpen(true);
  }

  async function decline() {
    if (!letter || !(await confirm({ message: "Mark this offer as declined? They'll move to Withdrew.", confirmLabel: "Mark declined" }))) return;
    const res = await fetch(`/api/erp/candidates/${candidate.id}/offer-letters/${letter.id}/decline`, { method: "POST" }).catch(() => null);
    if (!res?.ok) return toast("Could not update", "error");
    toast("Offer marked declined.");
    router.refresh();
  }

  async function voidLetter() {
    if (!letter || !(await confirm({ message: "Void this letter? It stays on file marked Void, and you can make a new one." }))) return;
    const res = await fetch(`/api/erp/candidates/${candidate.id}/offer-letters/${letter.id}/void`, { method: "POST" }).catch(() => null);
    if (!res?.ok) return toast("Could not void", "error");
    toast("Letter voided.");
    router.refresh();
  }

  async function remove() {
    if (!letter || !(await confirm({ message: "Delete this draft?" }))) return;
    const res = await fetch(`/api/erp/candidates/${candidate.id}/offer-letters/${letter.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast("Could not delete", "error");
    setDirty(false);
    toast("Draft deleted.");
    router.push(`/erp/candidates/${candidate.id}?tab=Offer`);
  }

  const filename = `Offer Letter - ${[values.title, candidate.fullName].filter(Boolean).join(" ")}.pdf`;
  const status = letter ? (OFFER_LETTER_STATUSES[letter.status] ?? OFFER_LETTER_STATUSES.DRAFT) : null;
  const fileBase = letter ? `/api/erp/candidates/${candidate.id}/offer-letters/${letter.id}/pdf` : "";
  const statusLine = letter
    ? [
        letter.sentAt ? `Sent ${shortDate(letter.sentAt)}${letter.sentBy ? ` by ${letter.sentBy}` : ""}` : null,
        letter.signedAt ? `Signed ${shortDate(letter.signedAt)}` : null,
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/erp/candidates/${candidate.id}?tab=Offer`} className="text-xs text-pink-600 hover:underline">
            ← {candidate.fullName}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">
            Offer letter{letter?.templateName ? <span className="ml-2 text-base font-normal text-gray-500">{letter.templateName}</span> : null}
            {status ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.cls}`}>{status.label}</span> : null}
          </h1>
          {statusLine ? <p className="mt-1 text-sm text-gray-500">{statusLine}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {letter?.status === "DRAFT" ? <Button variant="ghost" size="sm" onClick={remove}>Delete draft</Button> : null}
          {letter?.status === "SENT" ? (
            <>
              <Button variant="ghost" size="sm" onClick={voidLetter}>Void</Button>
              <Button variant="secondary" size="sm" onClick={decline}>Mark declined</Button>
            </>
          ) : null}
          {readOnly ? (
            <>
              {letter?.status === "SIGNED" ? (
                <a href={`${fileBase}?copy=sent&download=1`} className="text-sm text-pink-600 hover:underline">Sent copy</a>
              ) : null}
              <a href={`${fileBase}?download=1`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                {letter?.status === "SIGNED" ? "Download signed" : "Download PDF"}
              </a>
            </>
          ) : pdfUrl ? (
            <a href={pdfUrl} download={filename} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Download PDF
            </a>
          ) : null}
          {!readOnly ? (
            <Button variant={letter ? "secondary" : "primary"} size="sm" onClick={save} disabled={saving || !dirty || (!letter && !templateId)}>
              {saving ? "Saving…" : dirty ? "Save draft" : "Saved"}
            </Button>
          ) : null}
          {letter?.status === "DRAFT" ? <Button size="sm" onClick={openSend} disabled={saving}>Send…</Button> : null}
          {letter?.status === "SENT" ? <Button size="sm" onClick={() => setUploadOpen(true)}>Upload signed copy</Button> : null}
        </div>
      </div>

      {letter && sendOpen ? (
        <SendOfferModal
          open
          onClose={() => setSendOpen(false)}
          candidateId={candidate.id}
          letterId={letter.id}
          candidateEmail={candidate.email}
          values={values}
          missing={missingOfferBlanks(sections, values).map((b) => b.label)}
        />
      ) : null}
      {letter && uploadOpen ? (
        <UploadSignedModal open onClose={() => setUploadOpen(false)} candidateId={candidate.id} letterId={letter.id} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          {!letter ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <label className={labelClass.default} htmlFor="ol-template">Template</label>
              {templates.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">
                  No templates yet. <Link href="/erp/candidates/offer-templates" className="text-pink-600 hover:underline">Add one</Link> first.
                </p>
              ) : (
                <SearchableSelect
                  id="ol-template"
                  value={templateId}
                  onChange={pickTemplate}
                  allLabel="Choose a template"
                  placeholder="Search templates…"
                  options={templates.map((t) => ({ value: t.id, label: t.name }))}
                  className="mt-1"
                />
              )}
              {template?.description ? <p className="mt-1 text-xs text-gray-500">{template.description}</p> : null}
            </div>
          ) : null}

          {baseSections.length ? (
            <fieldset disabled={readOnly} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Fill in</h2>
                {emptyBlanks.length ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">{emptyBlanks.length} empty</span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">All filled</span>
                )}
              </div>
              {blanks.map((b) => {
                const empty = !values[b.key]?.trim();
                return (
                  <div key={b.key}>
                    <label className={`${labelClass.default} flex items-center gap-1`} htmlFor={`ol-${b.key}`}>
                      {b.label}
                      {b.key === "salary" && salaryHint ? <InfoTip text={salaryHint} /> : null}
                    </label>
                    <input
                      id={`ol-${b.key}`}
                      type={b.date ? "date" : "text"}
                      value={values[b.key] ?? ""}
                      onChange={(e) => setValue(b.key, e.target.value)}
                      placeholder={b.sample}
                      className={`${inputClass.md} ${empty ? "border-amber-300 bg-amber-50/40" : ""}`}
                    />
                  </div>
                );
              })}
              {blanks.length === 0 ? <p className="text-xs text-gray-500">This template has no blanks.</p> : null}
            </fieldset>
          ) : null}

          {baseSections.length ? (
            <fieldset disabled={readOnly} className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                Sections
                <InfoTip text="Untick a section to leave it out of this letter only. The template stays the same." />
              </h2>
              <div className="space-y-1.5">
                {baseSections.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={included.has(s.key)} onChange={(e) => toggleSection(s.key, e.target.checked)} />
                    <span className="truncate">{sectionLabel(s)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {hasCommission && commission ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Commission</h2>
              {parseMoneyCents(values.salary) == null ? (
                <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Fill in the salary to show total earnings on the ladder.</p>
              ) : null}
              <CommissionFields
                compact
                disabled={readOnly}
                plan={commission}
                onChange={(p) => {
                  setCommission(p);
                  setDirty(true);
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
            Preview
            {loadingPreview ? <span className="text-gray-400">Updating…</span> : null}
            {previewError ? <span className="text-red-600">{previewError}</span> : null}
          </div>
          {pdfUrl ? (
            <iframe src={`${pdfUrl}#view=FitH`} title="Offer letter preview" className="h-[80vh] w-full rounded-md border border-gray-200 bg-white" />
          ) : (
            <div className="flex h-[60vh] items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
              {templateId || letter ? "Building preview…" : "Choose a template to see the letter"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
