"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useConfirm, useToast } from "@/app/erp/components/ui";

export function ResendButton({ id, recipients }: { id: string; recipients: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function resend() {
    const ok = await confirm({ title: "Send this email again?", message: `It goes to ${recipients}, exactly as before.`, confirmLabel: "Resend" });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/notifications/log/${id}/resend`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) toast(json.error ?? "Resend failed", "error");
      else {
        toast("Email sent again");
        router.push("/erp/notifications/log");
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" onClick={resend} disabled={busy}>
      {busy ? "Sending…" : "Resend"}
    </Button>
  );
}
