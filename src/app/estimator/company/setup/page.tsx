"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEstimatorAuth } from "@/lib/estimatorAuthContext";

type Mode = "create" | "join";

// Reached whenever a logged-in estimator account has no company yet: right
// after signup, or after an owner removes someone from their company (see
// the redirect logic in estimatorAuthContext.tsx). Both cases land here
// because both need the exact same thing, a company to attach to, before
// the rest of the tool is usable.
export default function EstimatorCompanySetupPage() {
  const router = useRouter();
  const { refreshUser } = useEstimatorAuth();
  const [mode, setMode] = useState<Mode>("create");
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Set once creation succeeds — the code only ever gets shown like this
  // once, after that it lives in Settings.
  const [created, setCreated] = useState<{ name: string; inviteCode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/estimator/company", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: companyName }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Could not create the company");
        setCreated(body.company);
      } else {
        const res = await fetch("/api/estimator/company/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inviteCode }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Could not join that company");
        await refreshUser();
        router.replace("/estimator");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function continueToEstimator() {
    await refreshUser();
    router.replace("/estimator");
  }

  if (created) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-5">
        <section className="w-full rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
          <h1 className="text-2xl font-semibold">Company created</h1>
          <p className="mt-2 text-sm text-slate-600">
            {created.name} is ready. Share this invite code with your team, anyone who enters it can join.
            You can find it again later in Settings.
          </p>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
            <span className="font-mono text-lg tracking-widest text-slate-900">{created.inviteCode}</span>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(created.inviteCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={continueToEstimator}
            className="mt-5 w-full rounded-md bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700"
          >
            Continue to the estimator
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-5">
      <section className="w-full rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-2xl font-semibold">Set up your company</h1>
        <p className="mt-2 text-sm text-slate-600">
          Projects and files are shared within a company. Create one, or join one with an invite code from a teammate.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "create" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            Create a company
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "join" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            Join a company
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === "create" ? (
            <input
              aria-label="Company name"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Company name"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              required
            />
          ) : (
            <input
              aria-label="Invite code"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="Invite code"
              className="w-full rounded-md border border-slate-300 px-3 py-2 uppercase tracking-widest"
              required
            />
          )}
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Working..." : mode === "create" ? "Create company" : "Join company"}
          </button>
        </form>
      </section>
    </main>
  );
}
