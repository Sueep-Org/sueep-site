"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BuildingProfileEditorProps {
  buildingId: string;
  initial: {
    name: string;
    address: string;
    pmName: string | null;
    pmEmail: string | null;
    pmPhone: string | null;
  };
}

export function BuildingProfileEditor({ buildingId, initial }: BuildingProfileEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [pmName, setPmName] = useState(initial.pmName ?? "");
  const [pmEmail, setPmEmail] = useState(initial.pmEmail ?? "");
  const [pmPhone, setPmPhone] = useState(initial.pmPhone ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const payload = {
      name,
      address,
      pmName: pmName || null,
      pmEmail: pmEmail || null,
      pmPhone: pmPhone || null,
    };

    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update building");
        setLoading(false);
        return;
      }
      setSuccess("Saved successfully.");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this building? This action cannot be undone.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete building");
        setLoading(false);
        return;
      }
      router.push("/erp/buildings");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600">Building name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Address *</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Property manager name</label>
          <input
            value={pmName}
            onChange={(e) => setPmName(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Property manager email</label>
          <input
            value={pmEmail}
            onChange={(e) => setPmEmail(e.target.value)}
            type="email"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600">Property manager phone</label>
          <input
            value={pmPhone}
            onChange={(e) => setPmPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{success}</div> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save building"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={loading}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete building
        </button>
      </div>
    </form>
  );
}
