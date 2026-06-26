"use client";

import { useState, useEffect, useRef } from "react";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]";
const label = "block text-xs font-medium text-gray-600";

type RequestType = "change-order" | "sov-schedule";

type ProjectOption = { id: string; jobTitle: string; supervisor: string | null };
type SovItem = { id: string; description: string; completed: boolean };

const STEP_LABELS_CO = ["Your Project", "Request Type", "Details"] as const;
const STEP_LABELS_SOV = ["Your Project", "Request Type", "SOV Item"] as const;

function StepIndicator({ current, type }: { current: number; type: RequestType | null }) {
  const labels = type === "sov-schedule" ? STEP_LABELS_SOV : STEP_LABELS_CO;
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

  async function handleSubmit() {
    setError("");
    if (!requesterName.trim()) { setError("Your name is required."); return; }
    if (!requesterEmail.trim()) { setError("Your email is required."); return; }
    if (requestType === "change-order" && !coTitle.trim()) {
      setError("Title is required.");
      return;
    }
    if (requestType === "sov-schedule" && !selectedSovId) {
      setError("Please select an SOV item.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/external/project-requests", {
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
          sovItemId: selectedSovId || undefined,
          desiredDate: desiredDate || undefined,
          comments: comments.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error || "Submission failed. Please try again."); return; }
      setSubmitted(true);
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
            setCoTitle(""); setCoDescription(""); setCoEstimatedStartDate("");
            setSelectedSovId(""); setDesiredDate(""); setComments("");
            setRequesterName(""); setRequesterEmail("");
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
      <StepIndicator current={step} type={requestType} />

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
              <label className={label} htmlFor="co-start-date">Estimated start date</label>
              <input
                id="co-start-date"
                type="date"
                className={input}
                value={coEstimatedStartDate}
                onChange={(e) => setCoEstimatedStartDate(e.target.value)}
              />
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-800">Pricing is not required — Sueep will review and get back to you with a cost estimate.</p>
            </div>
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

        {/* Step 3 — SOV details */}
        {step === 3 && requestType === "sov-schedule" && (
          <>
            <p className="text-sm text-gray-500">
              Project: <span className="font-medium text-gray-800">{selectedProject?.jobTitle}</span>
            </p>

            {sovLoading && <p className="text-sm text-gray-500">Loading SOV items…</p>}

            {!sovLoading && sovItems.length === 0 && (
              <p className="text-sm text-gray-500">No SOV items found for this project. Please contact Sueep directly.</p>
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
              <label className={label} htmlFor="sov-date">Desired date</label>
              <input
                id="sov-date"
                type="date"
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
            disabled={loading}
            onClick={() => { void handleSubmit(); }}
            className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Submitting…" : "Submit request"}
          </button>
        )}
      </div>
    </div>
  );
}
