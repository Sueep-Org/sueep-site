"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewBuildingForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name"),
      address: formData.get("address"),
      pmName: formData.get("pmName") || undefined,
      pmEmail: formData.get("pmEmail") || undefined,
      pmPhone: formData.get("pmPhone") || undefined,
    };

    try {
      const res = await fetch("/api/erp/buildings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create building");
        setLoading(false);
        return;
      }
      setOpen(false);
      if (data.id) {
        router.push(`/erp/buildings/${data.id}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500"
      >
        {open ? "Close" : "Add building"}
      </button>

      {open ? (
        <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              placeholder="Building name *"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <input
              name="address"
              required
              placeholder="Address *"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <input
              name="pmName"
              placeholder="Property manager name"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <input
              name="pmEmail"
              type="email"
              placeholder="Property manager email"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <input
              name="pmPhone"
              placeholder="Property manager phone"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </div>

          {error ? <p className="text-xs text-red-500">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save building"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
