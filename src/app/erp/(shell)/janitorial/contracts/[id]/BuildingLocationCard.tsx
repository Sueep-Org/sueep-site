"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, inputClass } from "@/app/erp/components/ui";

/** Where the building is, for flagging clock-ins made away from it. */
export function BuildingLocationCard({
  contractId,
  latitude,
  longitude,
  status,
  latestClockIn,
}: {
  contractId: string;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  latestClockIn: { employeeName: string; at: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pasting, setPasting] = useState(false);
  const [coords, setCoords] = useState("");

  const hasLocation = latitude != null && longitude != null;

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/janitorial/contracts/${contractId}/location`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setPasting(false);
      setCoords("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function savePasted(e: React.FormEvent) {
    e.preventDefault();
    // Google Maps copies "40.08747, -75.41041" when you right-click a spot.
    const parts = coords.split(/[,\s]+/).filter(Boolean).map(Number);
    if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
      setError("Paste coordinates like 40.0875, -75.4104");
      return;
    }
    void send({ action: "manual", latitude: parts[0], longitude: parts[1] });
  }

  const statusText = hasLocation
    ? status === "MANUAL"
      ? "Set by hand"
      : "Found from the address"
    : status === "NOT_FOUND"
      ? "The address couldn't be found, so clock-in locations aren't being checked here."
      : "Not looked up yet. It's looked up automatically after the first clock-in here.";

  return (
    <section className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Building location</h2>
          <p className="text-xs text-gray-500">
            Clock-ins more than about a quarter mile away are flagged for review. {statusText}
          </p>
          {hasLocation && (
            <a
              href={`https://www.google.com/maps?q=${latitude},${longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-pink-600 hover:underline"
            >
              Check it on Google Maps
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="xs" disabled={busy} onClick={() => send({ action: "lookup" })}>
            Look up address
          </Button>
          {latestClockIn && (
            <Button
              variant="secondary"
              size="xs"
              disabled={busy}
              onClick={() => send({ action: "fromClockIn" })}
              title={`Use where ${latestClockIn.employeeName} clocked in on ${new Date(latestClockIn.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            >
              Use last clock-in spot
            </Button>
          )}
          <Button variant="secondary" size="xs" disabled={busy} onClick={() => setPasting((v) => !v)}>
            Paste coordinates
          </Button>
        </div>
      </div>

      {pasting && (
        <form onSubmit={savePasted} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={coords}
            onChange={(e) => setCoords(e.target.value)}
            placeholder="40.0875, -75.4104"
            aria-label="Coordinates"
            className={`${inputClass.xs} w-56`}
          />
          <Button type="submit" size="xs" disabled={busy}>Save</Button>
          <span className="text-xs text-gray-500">In Google Maps, right-click the building and click the numbers to copy them.</span>
        </form>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </section>
  );
}
