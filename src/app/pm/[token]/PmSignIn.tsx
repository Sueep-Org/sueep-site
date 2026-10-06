"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PmSignIn({ token, firstName, maskedEmail }: { token: string; firstName: string; maskedEmail: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(path: "code" | "verify", body?: unknown): Promise<boolean> {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/pm/${token}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return false;
      }
      return true;
    } catch {
      setError("Couldn't connect. Check your internet and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    if (await post("code")) {
      setSent(true);
      setCode("");
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (await post("verify", { code })) router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-gray-900">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-pink-600">Sueep</p>
        <h1 className="mt-2 text-lg font-semibold">Hi {firstName}</h1>

        {!sent ? (
          <>
            <p className="mt-2 text-sm text-gray-600">
              To keep your turnovers private, we&apos;ll email a 6-digit code to <span className="font-medium text-gray-900">{maskedEmail}</span>.
              You only need to do this once on this device.
            </p>
            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="mt-4 w-full rounded-md bg-pink-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </>
        ) : (
          <form onSubmit={verify}>
            <p className="mt-2 text-sm text-gray-600">
              We sent a code to <span className="font-medium text-gray-900">{maskedEmail}</span>. It works for 15 minutes.
            </p>
            <label htmlFor="pm-code" className="mt-4 block text-xs font-medium text-gray-600">
              Code
            </label>
            <input
              id="pm-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2.5 text-center text-xl tracking-[0.4em] text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
            <button
              type="submit"
              disabled={busy || code.replace(/\D/g, "").length !== 6}
              className="mt-4 w-full rounded-md bg-pink-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {busy ? "Checking…" : "Continue"}
            </button>
            <button type="button" onClick={sendCode} disabled={busy} className="mt-3 w-full text-center text-xs text-gray-500 hover:text-pink-600 disabled:opacity-50">
              Didn&apos;t get it? Send a new code
            </button>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}
