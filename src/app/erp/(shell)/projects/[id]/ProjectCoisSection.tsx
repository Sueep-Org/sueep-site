"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { checkRequirements, policyTypeLabel, requirementSummary, type ExpiryStatus } from "@/lib/erp/insurance";
import { todayEasternKey } from "@/lib/erp/dates";
import { ExpiryBadge } from "../../insurance/badges";
import type { HolderRow, PolicyRow } from "../../insurance/types";
import { RequestCard } from "../../insurance/requests/RequestCard";
import type { RequestRow } from "../../insurance/requests/types";

export type ProjectCoiRow = {
  id: string;
  holderName: string;
  issuedOn: string;
  expiresAt: string;
  sentOn: string | null;
  sentTo: string | null;
  notes: string | null;
  filename: string;
  policies: { policyType: string; carrier: string; policyNumber: string | null; expiresAt: string }[];
  /** Newest COI for its holder on this project */
  current: boolean;
  status: ExpiryStatus;
};

/** What the Add COI form starts with when opened from a request. */
type AddPrefill = { holderId: string | null; holderName: string; requestId: string | null; notes: string };

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const SHORT_TYPE: Record<string, string> = {
  GENERAL_LIABILITY: "GL",
  UMBRELLA: "Umbrella",
  AUTO: "Auto",
  HIRED_NON_OWNED_AUTO: "Auto (HNOA)",
  WORKERS_COMP: "WC",
  OTHER: "Other",
};

export function ProjectCoisSection({
  projectId,
  cois,
  holders,
  policies,
  requests,
}: {
  projectId: string;
  cois: ProjectCoiRow[];
  holders: HolderRow[];
  policies: PolicyRow[];
  requests: RequestRow[];
}) {
  const [adding, setAdding] = useState<AddPrefill | null>(null);
  const [editing, setEditing] = useState<ProjectCoiRow | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  function addFromRequest(r: RequestRow, index: number) {
    const h = r.holders[index];
    setAdding({ holderId: h.matchedId, holderName: h.name, requestId: r.id, notes: `Requested by ${r.requesterName}` });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-gray-900">COIs</h2>
          <InfoTip text="Certificates of insurance we gave out for this project. Make the COI in CoverDash, then add the PDF here. The newest one for each company is the current one." />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setLinkOpen(true)}>
            Request link
          </Button>
          <Button size="sm" onClick={() => setAdding({ holderId: null, holderName: "", requestId: null, notes: "" })}>
            + Add COI
          </Button>
        </div>
      </div>

      {requests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Open requests</p>
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} onAddCoi={(i) => addFromRequest(r, i)} />
          ))}
        </div>
      )}

      {cois.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">No COIs for this project yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">For</th>
                <th className="px-3 py-2 font-medium">Policies</th>
                <th className="px-3 py-2 font-medium">Issued</th>
                <th className="px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    Good until
                    <InfoTip text="When the first policy on the certificate expires. After that the GC needs a new one." />
                  </span>
                </th>
                <th className="px-3 py-2 font-medium">Sent</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cois.map((c) => (
                <tr key={c.id} onClick={() => setEditing(c)} className={`cursor-pointer hover:bg-gray-50 ${c.current ? "" : "text-gray-400"}`}>
                  <td className="px-3 py-2.5">
                    <div className={`font-medium ${c.current ? "text-gray-900" : ""}`}>{c.holderName}</div>
                    {!c.current && <div className="text-xs">Replaced</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{c.policies.map((p) => SHORT_TYPE[p.policyType] ?? p.policyType).join(" · ")}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmtDay(c.issuedOn)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">{fmtDay(c.expiresAt)}</span>
                      {c.current && <ExpiryBadge status={c.status} />}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {c.sentOn ? (
                      <span className="tabular-nums">{fmtDay(c.sentOn)}</span>
                    ) : (
                      <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Not sent</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <a
                      href={`/api/erp/projects/${projectId}/cois/${c.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-medium text-pink-600 hover:underline"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddCoiForm projectId={projectId} holders={holders} policies={policies} prefill={adding} onClose={() => setAdding(null)} />}
      {linkOpen && <RequestLinkModal projectId={projectId} onClose={() => setLinkOpen(false)} />}
      {editing && <EditCoiForm projectId={projectId} coi={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function AddCoiForm({
  projectId,
  holders,
  policies,
  prefill,
  onClose,
}: {
  projectId: string;
  holders: HolderRow[];
  policies: PolicyRow[];
  prefill: AddPrefill;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const today = todayEasternKey();
  const [holderId, setHolderId] = useState(prefill.holderId ?? "");
  const [typedName, setTypedName] = useState(prefill.holderId ? "" : prefill.holderName);
  const [notListed, setNotListed] = useState(!prefill.holderId && !!prefill.holderName);
  const [policyIds, setPolicyIds] = useState<string[]>(() => policies.filter((p) => p.onCertificates).map((p) => p.id));
  const [issuedOn, setIssuedOn] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const [sent, setSent] = useState(false);
  const [sentOn, setSentOn] = useState(today);
  const [sentTo, setSentTo] = useState(() => holders.find((h) => h.id === prefill.holderId)?.contactEmail ?? "");
  const [notes, setNotes] = useState(prefill.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const holder = holders.find((h) => h.id === holderId) ?? null;
  const selectedPolicies = policies.filter((p) => policyIds.includes(p.id));
  const goodUntil = selectedPolicies.length ? selectedPolicies.map((p) => p.expiresAt).sort()[0] : null;
  // Checked against the policies picked for this COI, not every policy.
  const checks = holder ? checkRequirements(holder, selectedPolicies.map((p) => ({ ...p, onCertificates: true }))) : [];

  function pickHolder(id: string) {
    setHolderId(id);
    const h = holders.find((x) => x.id === id);
    if (h?.contactEmail && !sentTo) setSentTo(h.contactEmail);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!file) {
      setError("Attach the COI PDF from CoverDash");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (!notListed && holderId) fd.set("holderId", holderId);
      else fd.set("holderName", typedName);
      fd.set("issuedOn", issuedOn);
      for (const id of policyIds) fd.append("policyIds", id);
      if (sent) {
        fd.set("sentOn", sentOn);
        fd.set("sentTo", sentTo);
      }
      fd.set("notes", notes);
      if (prefill.requestId) fd.set("requestId", prefill.requestId);
      const res = await fetch(`/api/erp/projects/${projectId}/cois`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      toast("COI added.");
      onClose();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} dismissible={false} size="lg">
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Add COI</h2>

        <div>
          <label className={labelClass.default} htmlFor="coi-holder">
            For * <InfoTip text="The company named in the certificate holder box. Pick from Certificate Holders so their saved details show below." />
          </label>
          {notListed ? (
            <input id="coi-holder" type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Name as on the certificate" className={inputClass.md} />
          ) : (
            <SearchableSelect
              id="coi-holder"
              value={holderId}
              onChange={pickHolder}
              options={holders.map((h) => ({ value: h.id, label: h.name }))}
              placeholder="Search holders…"
              allLabel="Pick a holder"
              className="mt-1"
            />
          )}
          <button
            type="button"
            onClick={() => {
              setNotListed((v) => !v);
              setHolderId("");
            }}
            className="mt-1 text-xs text-pink-600 hover:underline"
          >
            {notListed ? "Pick from Certificate Holders instead" : "Not listed? Type a name"}
          </button>
        </div>

        {holder && <HolderDetails holder={holder} />}

        <fieldset className="space-y-2">
          <legend className={`${labelClass.default} flex items-center gap-1`}>
            Policies on this COI * <InfoTip text="Check the policies listed on the PDF. Policies marked On our COIs are pre-checked." />
          </legend>
          {policies.length === 0 ? (
            <p className="text-xs text-amber-700">No active policies. Add them under Insurance &amp; COIs first.</p>
          ) : (
            <div className="space-y-1.5">
              {policies.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={policyIds.includes(p.id)}
                    onChange={(e) => setPolicyIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))}
                    className="h-4 w-4 text-pink-600"
                  />
                  {policyTypeLabel(p.policyType)}
                  <span className="text-xs text-gray-500">
                    {p.carrier} · expires {fmtDay(p.expiresAt)}
                  </span>
                </label>
              ))}
            </div>
          )}
          {goodUntil && <p className="text-xs text-gray-600">Good until <span className="font-medium">{fmtDay(goodUntil)}</span></p>}
        </fieldset>

        {checks.length > 0 && (
          <ul className="space-y-1 rounded-md border border-gray-200 bg-gray-50 p-3">
            {checks.map((c) => (
              <li key={c.text} className={`text-xs ${c.level === "gap" ? "text-red-700" : "text-amber-700"}`}>
                {c.level === "gap" ? "Gap: " : "Note: "}
                {c.text}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass.default} htmlFor="coi-issued">Date on the COI *</label>
            <input id="coi-issued" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className={inputClass.md} />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="coi-file">PDF *</label>
            <input
              id="coi-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={sent} onChange={(e) => setSent(e.target.checked)} className="h-4 w-4 text-pink-600" />
            Already sent
          </label>
          {sent && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass.default} htmlFor="coi-sent-on">Sent on</label>
                <input id="coi-sent-on" type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} className={inputClass.md} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="coi-sent-to">Sent to</label>
                <input id="coi-sent-to" type="text" value={sentTo} onChange={(e) => setSentTo(e.target.value)} placeholder="Email or portal" className={inputClass.md} />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass.default} htmlFor="coi-notes">Notes</label>
          <input id="coi-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass.md} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** What the holder needs on their certificate, to copy into CoverDash. */
function HolderDetails({ holder }: { holder: HolderRow }) {
  const summary = requirementSummary(holder);
  const rows: [string, string | null][] = [
    ["Name", holder.name],
    ["Address", holder.address],
    ["Requires", summary.length ? summary.join(" · ") : null],
    ["Additional insured", holder.additionalInsureds],
    ["Wording", holder.specialWording],
  ];
  return (
    <dl className="space-y-1.5 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
      <p className="flex items-center gap-1 font-semibold text-gray-700">
        For CoverDash <InfoTip text="Their saved details from Certificate Holders. Copy these into CoverDash when making the COI." />
      </p>
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="grid grid-cols-[7rem_1fr] gap-2">
            <dt className="text-gray-500">{k}</dt>
            <dd className="whitespace-pre-line text-gray-800">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function EditCoiForm({ projectId, coi, onClose }: { projectId: string; coi: ProjectCoiRow; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [sent, setSent] = useState(coi.sentOn != null);
  const [sentOn, setSentOn] = useState(coi.sentOn ?? todayEasternKey());
  const [sentTo, setSentTo] = useState(coi.sentTo ?? "");
  const [notes, setNotes] = useState(coi.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/cois/${coi.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sentOn: sent ? sentOn : null, sentTo, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      toast("COI saved.");
      onClose();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({ title: "Delete this COI?", message: "This removes the PDF and its record from the project.", confirmLabel: "Delete" });
    if (!ok) return;
    const res = await fetch(`/api/erp/projects/${projectId}/cois/${coi.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete");
      return;
    }
    toast("COI deleted.");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} dismissible={false} size="lg">
      <form onSubmit={save} className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{coi.holderName}</h2>
          <p className="text-xs text-gray-500">
            Issued {fmtDay(coi.issuedOn)} · good until {fmtDay(coi.expiresAt)}
          </p>
        </div>

        <ul className="space-y-1 text-xs text-gray-700">
          {coi.policies.map((p) => (
            <li key={`${p.policyType}-${p.policyNumber ?? p.carrier}`}>
              {policyTypeLabel(p.policyType)} <span className="text-gray-500">· {p.carrier}{p.policyNumber ? ` · ${p.policyNumber}` : ""} · expires {fmtDay(p.expiresAt)}</span>
            </li>
          ))}
        </ul>

        <a href={`/api/erp/projects/${projectId}/cois/${coi.id}/file`} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-pink-600 hover:underline">
          Open PDF
        </a>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={sent} onChange={(e) => setSent(e.target.checked)} className="h-4 w-4 text-pink-600" />
            Sent
          </label>
          {sent && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass.default} htmlFor="ec-sent-on">Sent on</label>
                <input id="ec-sent-on" type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} className={inputClass.md} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="ec-sent-to">Sent to</label>
                <input id="ec-sent-to" type="text" value={sentTo} onChange={(e) => setSentTo(e.target.value)} placeholder="Email or portal" className={inputClass.md} />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass.default} htmlFor="ec-notes">Notes</label>
          <input id="ec-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass.md} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={remove}>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** This project's COI request link, to send to the GC or property manager. */
function RequestLinkModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load(reset: boolean) {
    setError("");
    const res = await fetch(`/api/erp/projects/${projectId}/coi-request-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reset }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not load the link");
      return;
    }
    setUrl(data.url);
    if (reset) toast("New link made. The old one no longer works.");
  }

  useEffect(() => {
    void load(false);
    // Load the link once when the popup opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reset() {
    const ok = await confirm({
      title: "Make a new link?",
      message: "The current link will stop working. Only do this if it was sent to the wrong person.",
      confirmLabel: "Make new link",
    });
    if (ok) await load(true);
  }

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold text-gray-900">COI request link</h2>
          <InfoTip text="Send this to the GC or property manager. They fill in who the COI is for and what it needs, and it shows up here under Open requests. They can reuse it for every COI on this project." />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">{url}</code>
            <Button
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                toast("Link copied.");
              }}
            >
              Copy
            </Button>
          </div>
        ) : (
          !error && <p className="text-sm text-gray-500">Loading…</p>
        )}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={reset} disabled={!url}>
            Make new link
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
