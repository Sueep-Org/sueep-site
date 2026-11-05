"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, useToast } from "@/app/erp/components/ui";

/** Shown while some emails still use the built-in recipients instead of a saved list. */
export function SaveDefaultsBanner({ count, canSave }: { count: number; canSave: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveAll() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/erp/notifications/save-defaults", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not save. Try again.");
    toast("Recipients saved");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="flex items-center gap-1.5">
        {count} {count === 1 ? "email uses" : "emails use"} built-in recipients
        <InfoTip text="These lists are set in the code, so a change of staff needs a code change. Save them here and this page becomes the only place that decides who gets each email. Nobody's emails change when you save." />
      </span>
      {canSave ? (
        <Button size="sm" disabled={busy} onClick={saveAll} className="ml-auto">
          {busy ? "Saving…" : "Save all"}
        </Button>
      ) : (
        <span className="ml-auto text-xs text-amber-700">Save all works on the live site only</span>
      )}
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </div>
  );
}
