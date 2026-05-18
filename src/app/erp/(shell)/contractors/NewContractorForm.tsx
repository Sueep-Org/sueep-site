"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewContractorForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/erp/contractors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email") || undefined,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to create contractor");
        setLoading(false);
        return;
      }
      setOpen(false);
      if (data.id) router.push(`/erp/contractors/${data.id}`);
      else router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500"
      >
        {open ? "Close" : "Add contractor"}
      </button>
      {open && (
        <form
          onSubmit={onSubmit}
          className="mt-3 w-full max-w-md space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              placeholder="Full name *"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 sm:col-span-2"
            />
            <input
              name="email"
              type="email"
              placeholder="Email"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 sm:col-span-2"
            />
          </div>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-pink-600 px-3 py-2 text-xs font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save contractor"}
          </button>
        </form>
      )}
    </div>
  );
}
