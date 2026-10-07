"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/app/erp/components/ui";
import { INBOX_CHANGED_EVENT } from "./areas";

export function MarkAllReadButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    try {
      const res = await fetch("/api/erp/inbox/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
      if (!res.ok) toast("Couldn't mark them read", "error");
      else {
        window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
        router.refresh();
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" onClick={markAll} disabled={busy}>
      {busy ? "Marking…" : "Mark all read"}
    </Button>
  );
}
