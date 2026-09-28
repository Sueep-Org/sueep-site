"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useConfirm } from "@/app/erp/components/ui";

/** The employee's private janitor clock-in link: create it, copy it to text
 * them, email it, or reset it if their phone is lost. */
export function EmployeeClockLinkSection({
  employeeId,
  firstName,
  email,
  initialUrl,
  createdAt,
}: {
  employeeId: string;
  firstName: string;
  email: string | null;
  initialUrl: string | null;
  createdAt: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function call(action: "create" | "reset" | "email" | "disable") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/erp/employees/${employeeId}/clock-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setUrl(json.url ?? null);
      if (action === "email") setMessage(`Emailed to ${email}.`);
      if (action === "reset") setMessage("New link created. The old link no longer works.");
      if (action === "disable") setMessage("Link turned off.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage(`Copied. Text it to ${firstName} and have them save it to their home screen.`);
    } catch {
      setError("Couldn't copy automatically. Select the link and copy it.");
    }
  }

  async function reset() {
    const ok = await confirm({
      title: "Reset clock-in link?",
      message: `${firstName}'s current link will stop working. Use this if their phone was lost or the link was shared. You'll need to send them the new one.`,
      confirmLabel: "Reset link",
    });
    if (ok) await call("reset");
  }

  async function disable() {
    const ok = await confirm({
      title: "Turn off clock-in link?",
      message: `${firstName} won't be able to clock in until you create a new link. Their scheduled hours will still be used.`,
      confirmLabel: "Turn off",
    });
    if (ok) await call("disable");
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-600">
        {firstName} uses this private link on their phone to clock in and out of janitorial shifts. No ERP login needed. If they
        don&apos;t clock in, their scheduled hours are used.
      </p>

      {url ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Clock-in link"
              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700"
            />
            <Button size="sm" onClick={copy} disabled={busy}>Copy link</Button>
            {email && (
              <Button size="sm" variant="secondary" onClick={() => call("email")} disabled={busy}>
                Email link
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {createdAt && <span>Created {new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
            <Button variant="ghost" size="xs" onClick={reset} disabled={busy} className="text-pink-600 hover:text-pink-700">
              Reset link
            </Button>
            <Button variant="ghost" size="xs" onClick={disable} disabled={busy} className="hover:text-red-600">
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <Button size="sm" onClick={() => call("create")} disabled={busy}>
          {busy ? "Creating…" : "Create clock-in link"}
        </Button>
      )}

      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
