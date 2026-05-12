"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type DistanceRow = {
  id: string;
  travelDate: string;
  miles: number;
  personName: string | null;
  notes: string | null;
};

const input =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-400";

export function ProjectDistanceSection({
  projectId,
  initialEntries,
}: {
  projectId: string;
  initialEntries: DistanceRow[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const travelDate = String(fd.get("travelDate") || "");
    const miles = Number(fd.get("miles"));
    const personName = String(fd.get("personName") || "").trim();
    const notes = String(fd.get("notes") || "").trim();

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/distances`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          travelDate: travelDate ? new Date(travelDate).toISOString() : "",
          miles,
          personName: personName || undefined,
          notes: notes || undefined,
        }),
      });
      const data = (await res.json()) as DistanceRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to add distance entry");
        setLoading(false);
        return;
      }
      setEntries((prev) => [data, ...prev]);
      e.currentTarget.reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const totalMiles = entries.reduce((s, e) => s + e.miles, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Distance log</h2>
          <p className="text-sm text-zinc-300">
            Total distance: <span className="font-semibold text-white">{totalMiles.toFixed(1)} mi</span>
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Date</th>
                <th className="py-2 pr-2 font-medium">Miles</th>
                <th className="py-2 pr-2 font-medium">Person</th>
                <th className="py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-zinc-500">
                    No distance entries yet.
                  </td>
                </tr>
              ) : (
                entries.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-2 text-zinc-300">{new Date(r.travelDate).toLocaleDateString()}</td>
                    <td className="py-2 pr-2 text-zinc-200">{r.miles.toFixed(1)}</td>
                    <td className="py-2 pr-2 text-zinc-300">{r.personName || "—"}</td>
                    <td className="py-2 text-zinc-500">{r.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={onAdd} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add distance entry</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={label} htmlFor="d-date">
              Date *
            </label>
            <input id="d-date" name="travelDate" type="date" required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="d-miles">
              Miles *
            </label>
            <input id="d-miles" name="miles" type="number" min={0.1} step={0.1} required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="d-person">
              Person
            </label>
            <input id="d-person" name="personName" className={input} placeholder="Driver / crew lead" />
          </div>
          <div>
            <label className={label} htmlFor="d-notes">
              Notes
            </label>
            <input id="d-notes" name="notes" className={input} placeholder="Roundtrip site visit" />
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add distance"}
        </button>
      </form>
    </div>
  );
}