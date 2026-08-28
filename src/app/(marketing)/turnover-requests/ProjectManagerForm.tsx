"use client";

import { useState, useEffect, useRef } from "react";
import { centsToDollars } from "@/lib/erp/money";
import { deriveChangeOrderSupervisorCount } from "@/lib/changeOrderLaborRates";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]";
const label = "block text-xs font-medium text-gray-600";

type RequestType = "change-order" | "sov-schedule";

type ProjectOption = {
  id: string;
  jobTitle: string;
  supervisor: string | null;
  /** Whether this project has a real, reviewed Labor rate set (as opposed to
   * still running on the internal default) — gates whether the CO step even
   * offers a price estimate at all. See hasCustomChangeOrderLaborRate. */
  hasCustomLaborRate: boolean;
};
type SovItem = { id: string; description: string; completed: boolean };

const STEP_LABELS_CO = ["Your Project", "Request Type", "Details"] as const;
const STEP_LABELS_CO_SIGNED = ["Your Project", "Request Type", "Details", "Sign Contract"] as const;
const STEP_LABELS_SOV = ["Your Project", "Request Type", "SOV Item"] as const;

function StepIndicator({ current, type, willSign }: { current: number; type: RequestType | null; willSign: boolean }) {
  const labels = type === "sov-schedule" ? STEP_LABELS_SOV : willSign ? STEP_LABELS_CO_SIGNED : STEP_LABELS_CO;
  const total = labels.length;
  return (
    <div className="flex items-center gap-1.5 border-b border-gray-100 pb-4">
      {labels.map((stepLabel, i) => {
        const s = i + 1;
        const done = s < current;
        const active = s === current;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-[#E73C6E] text-white" : active ? "bg-[#E73C6E] text-white ring-2 ring-pink-200" : "bg-gray-200 text-gray-500"}`}>
              {done ? "✓" : s}
            </div>
            {active && <span className="text-xs font-medium text-[#E73C6E]">{stepLabel}</span>}
            {s < total && <div className={`h-px w-4 shrink-0 ${done ? "bg-[#E73C6E]" : "bg-gray-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  onBack: () => void;
}

export function ProjectManagerForm({ onBack }: Props) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Step 1 — project search
  const [search, setSearch] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Requester info (collected in step 3)
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");

  // Step 2 — request type
  const [requestType, setRequestType] = useState<RequestType | null>(null);

  // Step 3 — CO fields
  const [coTitle, setCoTitle] = useState("");
  const [coDescription, setCoDescription] = useState("");
  const [coEstimatedStartDate, setCoEstimatedStartDate] = useState("");
  const [coEstimatedEndDate, setCoEstimatedEndDate] = useState("");
  const [coCleanerCount, setCoCleanerCount] = useState("");
  const [coNoCrewRequired, setCoNoCrewRequired] = useState(false);
  function handleCoNoCrewRequiredChange(checked: boolean) {
    setCoNoCrewRequired(checked);
    if (checked) setCoCleanerCount("");
  }
  // No supervisor input — a crew always needs one, so it's derived from
  // cleaner count, not entered (see deriveChangeOrderSupervisorCount).
  const coSupervisorCount = deriveChangeOrderSupervisorCount(Number(coCleanerCount) || 0);
  const [coPriceCents, setCoPriceCents] = useState<number | null>(null);
  const [coPriceLoading, setCoPriceLoading] = useState(false);
  const coPriceDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clientCompany, setClientCompany] = useState("");
  const [clientAddress, setClientAddress] = useState("");

  // Step 4, Download & Sign (only reached for a priced change order, see
  // willSign below). An unpriced/no-crew CO submits straight from step 3,
  // the contract gets sent for signature later once Sueep prices it.
  const willSign = requestType === "change-order" && !coNoCrewRequired && coPriceCents != null;
  const [contractPdfUrl, setContractPdfUrl] = useState("");
  const [contractDownloaded, setContractDownloaded] = useState(false);
  const [signingLoading, setSigningLoading] = useState(false);
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const signedFileRef = useRef<HTMLInputElement>(null);

  // Step 3 — SOV fields
  const [sovItems, setSovItems] = useState<SovItem[]>([]);
  const [sovLoading, setSovLoading] = useState(false);
  const [selectedSovId, setSelectedSovId] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [comments, setComments] = useState("");

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const q = search.trim();
    if (q.length < 2) { setProjects([]); setSelectedProjectId(""); return; }
    searchDebounce.current = setTimeout(async () => {
      setProjectsLoading(true);
      try {
        const res = await fetch(`/api/external/projects?search=${encodeURIComponent(q)}`);
        const data = (await res.json()) as ProjectOption[];
        setProjects(Array.isArray(data) ? data : []);
        setSelectedProjectId("");
      } catch {
        // silent — user can retry by typing
      } finally {
        setProjectsLoading(false);
      }
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Live price preview as the requester types in a crew size — only fires
  // once a project with a real Labor rate is selected (see ProjectOption).
  // Supervisor count isn't sent — the estimate endpoint derives it itself
  // from cleanerCount (see deriveChangeOrderSupervisorCount).
  useEffect(() => {
    if (coPriceDebounce.current) clearTimeout(coPriceDebounce.current);
    if (!selectedProject?.hasCustomLaborRate) { setCoPriceCents(null); return; }
    const cleaners = Number(coCleanerCount) || 0;
    if (cleaners <= 0) { setCoPriceCents(null); return; }
    coPriceDebounce.current = setTimeout(async () => {
      setCoPriceLoading(true);
      try {
        const params = new URLSearchParams({ cleanerCount: String(cleaners) });
        const res = await fetch(`/api/external/projects/${selectedProject.id}/co-price-estimate?${params}`);
        const data = (await res.json()) as { priced?: boolean; totalCents?: number };
        setCoPriceCents(data.priced && typeof data.totalCents === "number" ? data.totalCents : null);
      } catch {
        setCoPriceCents(null);
      } finally {
        setCoPriceLoading(false);
      }
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coCleanerCount, selectedProject?.id, selectedProject?.hasCustomLaborRate]);

  async function loadSovItems(projectId: string) {
    setSovLoading(true);
    setSovItems([]);
    setSelectedSovId("");
    try {
      const res = await fetch(`/api/external/projects/${projectId}/sov`);
      const data = (await res.json()) as { items?: SovItem[] };
      setSovItems(data.items ?? []);
    } catch {
      setError("Could not load SOV items. Please try again.");
    } finally {
      setSovLoading(false);
    }
  }

  function handleBack() {
    setError("");
    if (step === 1) { onBack(); return; }
    if (step === 2) { setRequestType(null); }
    if (step === 4) {
      if (contractPdfUrl) URL.revokeObjectURL(contractPdfUrl);
      setContractPdfUrl("");
      setContractDownloaded(false);
      setSignedFile(null);
      if (signedFileRef.current) signedFileRef.current.value = "";
    }
    setStep((s) => s - 1);
  }

  function handleNextStep1() {
    if (!selectedProjectId) { setError("Please select a project."); return; }
    setError("");
    setStep(2);
  }

  async function handleNextStep2() {
    if (!requestType) { setError("Please choose a request type."); return; }
    setError("");
    if (requestType === "sov-schedule") {
      await loadSovItems(selectedProjectId);
    }
    setStep(3);
  }

  function validateStep3(): string {
    if (!requesterName.trim()) return "Your name is required.";
    if (!requesterEmail.trim()) return "Your email is required.";
    if (requestType === "change-order" && !coTitle.trim()) return "Title is required.";
    if (requestType === "change-order" && !coEstimatedStartDate) return "Estimated start date is required.";
    if (requestType === "change-order" && coEstimatedEndDate && coEstimatedEndDate < coEstimatedStartDate) {
      return "Estimated end date must be on or after the start date.";
    }
    if (requestType === "sov-schedule" && sovItems.length > 0 && !selectedSovId) return "Please select an SOV item.";
    if (requestType === "sov-schedule" && !desiredDate) return "Desired date is required.";
    return "";
  }

  /** Actually creates the request (and, for a signed CO, attaches the
   * uploaded contract). Called directly for SOV/unpriced-CO requests, or
   * after the signed PDF is uploaded for a priced CO (see
   * handleUploadSigned). */
  async function submitRequest(signedContract?: File) {
    let res: Response;
    if (signedContract) {
      const fd = new FormData();
      fd.append("type", requestType ?? "");
      fd.append("projectId", selectedProjectId);
      fd.append("requesterName", requesterName.trim());
      fd.append("requesterEmail", requesterEmail.trim());
      if (coTitle.trim()) fd.append("coTitle", coTitle.trim());
      if (coDescription.trim()) fd.append("coDescription", coDescription.trim());
      if (coEstimatedStartDate) fd.append("coEstimatedStartDate", coEstimatedStartDate);
      if (coEstimatedEndDate) fd.append("coEstimatedEndDate", coEstimatedEndDate);
      // Supervisor count isn't sent, the server derives it from
      // coCleanerCount itself (see deriveChangeOrderSupervisorCount).
      if (coCleanerCount.trim()) fd.append("coCleanerCount", coCleanerCount.trim());
      fd.append("coNoCrewRequired", String(coNoCrewRequired));
      fd.append("signedContract", signedContract);
      res = await fetch("/api/external/project-requests", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/external/project-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: requestType,
          projectId: selectedProjectId,
          requesterName: requesterName.trim(),
          requesterEmail: requesterEmail.trim(),
          coTitle: coTitle.trim() || undefined,
          coDescription: coDescription.trim() || undefined,
          coEstimatedStartDate: coEstimatedStartDate || undefined,
          coEstimatedEndDate: coEstimatedEndDate || undefined,
          coCleanerCount: coCleanerCount.trim() || undefined,
          coNoCrewRequired,
          sovItemId: selectedSovId || undefined,
          desiredDate: desiredDate || undefined,
          comments: comments.trim() || undefined,
        }),
      });
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setError(data.error || "Submission failed. Please try again."); return false; }
    setSubmitted(true);
    return true;
  }

  async function handleSubmit() {
    const err = validateStep3();
    if (err) { setError(err); return; }
    setError("");

    if (willSign) {
      if (!clientCompany.trim()) { setError("Client / GC name is required."); return; }
      if (!clientAddress.trim()) { setError("Client address is required."); return; }
      setSigningLoading(true);
      try {
        const res = await fetch("/api/co-request-contract-pdf", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId: selectedProjectId,
            coTitle: coTitle.trim(),
            coDescription: coDescription.trim() || undefined,
            coEstimatedStartDate: coEstimatedStartDate || undefined,
            coCleanerCount: coCleanerCount.trim() || undefined,
            clientCompany: clientCompany.trim(),
            clientAddress: clientAddress.trim(),
            requesterName: requesterName.trim(),
            requesterEmail: requesterEmail.trim(),
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error || "Could not prepare the contract. Please try again.");
          return;
        }
        const blob = await res.blob();
        setContractPdfUrl(URL.createObjectURL(blob));
        setContractDownloaded(false);
        setSignedFile(null);
        setStep(4);
      } catch {
        setError("Network error preparing contract. Please try again.");
      } finally {
        setSigningLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      await submitRequest();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadSigned() {
    if (!signedFile) { setError("Please upload your signed contract PDF."); return; }
    setError("");
    setLoading(true);
    try {
      const ok = await submitRequest(signedFile);
      if (!ok) return;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-6 rounded-xl border border-green-200 bg-green-50 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-7 w-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-semibold text-green-900">Request submitted!</p>
          <p className="mt-2 max-w-sm text-sm text-green-700">
            {requestType === "change-order"
              ? "Your change order request has been sent to the project supervisor and Sueep PM. We'll be in touch shortly."
              : "Your scheduling request has been sent to the project supervisor and Sueep PM. We'll be in touch to confirm."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setStep(1);
            setSearch("");
            setProjects([]);
            setSelectedProjectId("");
            setRequestType(null);
            setCoTitle(""); setCoDescription(""); setCoEstimatedStartDate(""); setCoEstimatedEndDate("");
            setCoCleanerCount(""); setCoPriceCents(null);
            setSelectedSovId(""); setDesiredDate(""); setComments("");
            setRequesterName(""); setRequesterEmail("");
            if (contractPdfUrl) URL.revokeObjectURL(contractPdfUrl);
            setContractPdfUrl(""); setContractDownloaded(false); setSignedFile(null);
          }}
          className="rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <StepIndicator current={step} type={requestType} willSign={willSign} />

      <div className="mt-6 space-y-5">

        {/* Step 1 — Find project */}
        {step === 1 && (
          <>
            <div>
              <label className={label} htmlFor="pm-search">Search project name</label>
              <div className="relative mt-1">
                <input
                  id="pm-search"
                  type="text"
                  className={input}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Start typing your project name…"
                  autoComplete="off"
                />
                {projectsLoading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Searching…</span>
                )}
              </div>
              {search.length > 0 && search.length < 2 && (
                <p className="mt-1 text-xs text-gray-400">Type at least 2 characters to search.</p>
              )}
            </div>

            {!projectsLoading && search.trim().length >= 2 && projects.length === 0 && (
              <p className="text-sm text-gray-500">No active projects found. Please check the name or contact Sueep directly.</p>
            )}

            {projects.length > 0 && (
              <div>
                <label className={label}>Select your project</label>
                <div className="mt-2 space-y-2">
                  {projects.map((p) => (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${selectedProjectId === p.id ? "border-[#E73C6E] bg-pink-50" : "border-gray-200 hover:border-pink-200"}`}
                    >
                      <input
                        type="radio"
                        name="project"
                        value={p.id}
                        checked={selectedProjectId === p.id}
                        onChange={() => setSelectedProjectId(p.id)}
                        className="mt-0.5 accent-[#E73C6E]"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.jobTitle}</p>
                        {p.supervisor && <p className="text-xs text-gray-500">Supervisor: {p.supervisor}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 2 — Request type */}
        {step === 2 && (
          <>
            <p className="text-sm text-gray-500">
              Project: <span className="font-medium text-gray-800">{selectedProject?.jobTitle}</span>
            </p>
            <p className="text-sm font-medium text-gray-700">What would you like to request?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                {
                  value: "sov-schedule" as const,
                  title: "Schedule SOV Work",
                  description: "Select a line item from your Schedule of Values and tell us when you'd like it done.",
                },
                {
                  value: "change-order" as const,
                  title: "Change Order",
                  description: "Request work outside the original scope. Sueep will follow up with pricing.",
                },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer flex-col gap-2 rounded-lg border px-4 py-4 transition ${requestType === opt.value ? "border-[#E73C6E] bg-pink-50" : "border-gray-200 hover:border-pink-200"}`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="requestType"
                      value={opt.value}
                      checked={requestType === opt.value}
                      onChange={() => setRequestType(opt.value)}
                      className="accent-[#E73C6E]"
                    />
                    <span className="text-sm font-semibold text-gray-900">{opt.title}</span>
                  </div>
                  <p className="pl-5 text-xs text-gray-500">{opt.description}</p>
                </label>
              ))}
            </div>
          </>
        )}

        {/* Step 3 — CO details */}
        {step === 3 && requestType === "change-order" && (
          <>
            <p className="text-sm text-gray-500">
              Project: <span className="font-medium text-gray-800">{selectedProject?.jobTitle}</span>
            </p>
            <div>
              <label className={label} htmlFor="co-title">Change order title *</label>
              <input
                id="co-title"
                className={input}
                value={coTitle}
                onChange={(e) => setCoTitle(e.target.value)}
                placeholder="e.g. Add waterproofing to basement walls"
              />
            </div>
            <div>
              <label className={label} htmlFor="co-desc">Description / scope of work</label>
              <textarea
                id="co-desc"
                rows={4}
                className={input}
                value={coDescription}
                onChange={(e) => setCoDescription(e.target.value)}
                placeholder="Describe what needs to be done and why…"
              />
            </div>
            <div>
              <label className={label} htmlFor="co-start-date">Estimated start date *</label>
              <input
                id="co-start-date"
                type="date"
                required
                className={input}
                value={coEstimatedStartDate}
                onChange={(e) => setCoEstimatedStartDate(e.target.value)}
              />
            </div>
            {/* Estimated end date hidden from the external form for now, per request. State and
                submit wiring left intact so it can be re-shown by restoring this block. */}
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={coNoCrewRequired}
                onChange={(e) => handleCoNoCrewRequiredChange(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
              />
              No crew required (material-only, price adjustment, subcontracted, etc.)
            </label>
            {coNoCrewRequired ? null : selectedProject?.hasCustomLaborRate ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-medium text-gray-700">Crew size</p>
                <div className="mt-3 max-w-[calc(50%-0.375rem)]">
                  <label className={label} htmlFor="co-cleaner-count"># of cleaners</label>
                  <input
                    id="co-cleaner-count"
                    type="number"
                    min={0}
                    step={1}
                    className={input}
                    placeholder="0"
                    value={coCleanerCount}
                    onChange={(e) => setCoCleanerCount(e.target.value)}
                  />
                </div>
                {coSupervisorCount > 0 && (
                  <p className="mt-2 text-[11px] text-gray-400">
                    Includes {coSupervisorCount} supervisor{coSupervisorCount === 1 ? "" : "s"} automatically.
                  </p>
                )}
                {(coPriceLoading || coPriceCents != null) && (
                  <p className="mt-3 text-sm text-gray-700">
                    Estimated price:{" "}
                    <span className="font-semibold text-gray-900">
                      {coPriceLoading ? "Calculating…" : centsToDollars(coPriceCents)}
                    </span>
                  </p>
                )}
                {coPriceCents != null && (
                  <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 sm:grid-cols-2">
                    <p className="text-xs text-gray-500 sm:col-span-2">
                      This project is priced, you&apos;ll sign the contract below before submitting.
                    </p>
                    <div>
                      <label className={label} htmlFor="co-client-company">Client / GC name *</label>
                      <input id="co-client-company" className={input} value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} placeholder="e.g. Brightview Construction" />
                    </div>
                    <div>
                      <label className={label} htmlFor="co-client-address">Client address *</label>
                      <input id="co-client-address" className={input} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Street, city, state, zip" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mt-0.5 h-4 w-4 shrink-0 text-amber-500">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.731 0-2.814-1.874-1.948-3.374L10.052 3.37c.866-1.5 3.032-1.5 3.898 0l7.354 12.75zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <p className="text-xs text-amber-800">We do not have rates set for your project. We will get back to you with a cost estimate.</p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 border-t border-gray-100 pt-4">
              <div>
                <label className={label} htmlFor="co-pm-name">Your name *</label>
                <input id="co-pm-name" className={input} value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <label className={label} htmlFor="co-pm-email">Your email *</label>
                <input id="co-pm-email" type="email" className={input} value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} placeholder="jane@company.com" />
              </div>
            </div>
          </>
        )}

        {/* Step 4, Download & Sign (priced change orders only) */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-sm font-medium text-blue-900">Almost done, download and sign the change order below.</p>
              <p className="mt-1 text-xs text-blue-700">
                {coTitle} - {coPriceCents != null ? centsToDollars(coPriceCents) : ""}
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-800">1. Download your contract</p>
              <p className="mt-1 text-xs text-gray-500">
                Open it, fill in the signature, printed name, and date at the bottom, and save it.
              </p>
              <a
                href={contractPdfUrl}
                download={`${coTitle.trim() || "change-order"}.pdf`}
                onClick={() => setContractDownloaded(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Download contract PDF
              </a>
              {contractDownloaded && <span className="ml-3 text-xs font-medium text-green-600">Downloaded ✓</span>}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-800">2. Upload your signed contract</p>
              <p className="mt-1 text-xs text-gray-500">Upload the signed PDF, then submit your request.</p>
              <input
                ref={signedFileRef}
                type="file"
                accept="application/pdf"
                className="mt-3 block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 file:shadow-sm hover:file:bg-gray-100"
                onChange={(e) => { setSignedFile(e.target.files?.[0] ?? null); setError(""); }}
              />
            </div>
          </div>
        )}

        {/* Step 3 — SOV details */}
        {step === 3 && requestType === "sov-schedule" && (
          <>
            <p className="text-sm text-gray-500">
              Project: <span className="font-medium text-gray-800">{selectedProject?.jobTitle}</span>
            </p>

            {sovLoading && <p className="text-sm text-gray-500">Loading SOV items…</p>}

            {!sovLoading && sovItems.length === 0 && (
              <p className="text-sm text-gray-500">
                This project doesn&apos;t have SOV line items set up yet, that&apos;s fine. Add a date and any comments
                below and we&apos;ll get it on the calendar.
              </p>
            )}

            {!sovLoading && sovItems.length > 0 && (
              <div>
                <label className={label}>Select SOV line item *</label>
                <div className="mt-2 max-h-64 overflow-y-auto space-y-2 rounded-md border border-gray-200 p-2">
                  {sovItems.map((item) => (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition ${selectedSovId === item.id ? "bg-pink-50 ring-1 ring-[#E73C6E]" : "hover:bg-gray-50"} ${item.completed ? "opacity-50" : ""}`}
                    >
                      <input
                        type="radio"
                        name="sovItem"
                        value={item.id}
                        checked={selectedSovId === item.id}
                        disabled={item.completed}
                        onChange={() => setSelectedSovId(item.id)}
                        className="mt-0.5 accent-[#E73C6E]"
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800">{item.description}</p>
                        {item.completed && <p className="text-xs text-green-600">Already completed</p>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className={label} htmlFor="sov-date">Desired date *</label>
              <input
                id="sov-date"
                type="date"
                required
                className={input}
                value={desiredDate}
                onChange={(e) => setDesiredDate(e.target.value)}
              />
            </div>
            <div>
              <label className={label} htmlFor="sov-comments">Comments</label>
              <textarea
                id="sov-comments"
                rows={3}
                className={input}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Any access requirements, special instructions, or context…"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 border-t border-gray-100 pt-4">
              <div>
                <label className={label} htmlFor="sov-pm-name">Your name *</label>
                <input id="sov-pm-name" className={input} value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <label className={label} htmlFor="sov-pm-email">Your email *</label>
                <input id="sov-pm-email" type="email" className={input} value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} placeholder="jane@company.com" />
              </div>
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>

        {step === 1 && (
          <button
            type="button"
            disabled={!selectedProjectId}
            onClick={handleNextStep1}
            className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Next
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            disabled={!requestType}
            onClick={() => { void handleNextStep2(); }}
            className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Next
          </button>
        )}
        {step === 3 && (
          <button
            type="button"
            disabled={loading || signingLoading}
            onClick={() => { void handleSubmit(); }}
            className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {signingLoading ? "Preparing contract…" : loading ? "Submitting…" : willSign ? "Continue to download & sign" : "Submit request"}
          </button>
        )}
        {step === 4 && (
          <button
            type="button"
            disabled={loading || !signedFile}
            onClick={() => { void handleUploadSigned(); }}
            className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Submitting…" : "Submit signed contract"}
          </button>
        )}
      </div>
    </div>
  );
}
