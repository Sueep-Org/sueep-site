"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useConfirm, useToast } from "@/app/erp/components/ui";
import { addOneYearKey, todayEasternKey } from "@/lib/erp/dates";

const formatKey = (key: string) =>
  new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Renew / Pause / Resume / End buttons in the contract page header. */
export function ContractStatusActions({
  contractId,
  status,
  buildingName,
  expirationDate,
}: {
  contractId: string;
  status: string;
  buildingName: string;
  /** "YYYY-MM-DD", null when the contract has no yearly term */
  expirationDate: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: "ACTIVE" | "PAUSED" | "ENDED") {
    if (next === "ENDED") {
      const ok = await confirm({
        title: "End this contract?",
        message: `No more billing months will be added for ${buildingName}, and its shifts stop showing after the end date. You can reactivate it later.`,
        confirmLabel: "End contract",
      });
      if (!ok) return;
    }
    if (next === "PAUSED") {
      const ok = await confirm({
        title: "Pause this contract?",
        message: `No billing months are added while it's paused, and its shifts are hidden from the calendar.`,
        confirmLabel: "Pause",
        danger: false,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/janitorial/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "Update failed", "error");
        return;
      }
      toast(next === "ACTIVE" ? "Contract active" : next === "PAUSED" ? "Contract paused" : "Contract ended", "success");
      router.refresh();
    } catch {
      toast("Network error", "error");
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    const next = addOneYearKey(expirationDate ?? todayEasternKey());
    const ok = await confirm({
      title: "Renew for another year?",
      message: `The expiration date for ${buildingName} moves to ${formatKey(next)}. Billing and shifts are not affected.`,
      confirmLabel: "Renew",
      danger: false,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/janitorial/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ renew: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "Update failed", "error");
        return;
      }
      toast("Contract renewed", "success");
      router.refresh();
    } catch {
      toast("Network error", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "ENDED" && expirationDate && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={renew}>
          Renew for another year
        </Button>
      )}
      {status === "ACTIVE" && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => setStatus("PAUSED")}>
          Pause
        </Button>
      )}
      {status !== "ACTIVE" && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => setStatus("ACTIVE")}>
          {status === "ENDED" ? "Reactivate" : "Resume"}
        </Button>
      )}
      {status !== "ENDED" && (
        <Button variant="danger" size="sm" disabled={busy} onClick={() => setStatus("ENDED")}>
          End contract
        </Button>
      )}
    </div>
  );
}
