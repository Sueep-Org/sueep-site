"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, labelClass } from "@/app/erp/components/ui";
import { LANGUAGE_OPTIONS } from "@/lib/erp/language";

const input = inputClass.md;
const label = labelClass.default;

type Props = {
  contractorId: string;
  initial: {
    name: string;
    email: string | null;
    phone: string | null;
    language: string;
    role: string | null;
    status: string;
    runsWithoutSupervisor: boolean;
  };
};

export function ContractorProfileEditor({ contractorId, initial }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOk("");
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch(`/api/erp/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email") || null,
          phone: fd.get("phone") || null,
          language: fd.get("language"),
          role: fd.get("role") || null,
          status: fd.get("status"),
          runsWithoutSupervisor: fd.get("runsWithoutSupervisor") === "on",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      setOk("Saved.");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={initial.name}
              className={input}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={initial.email ?? ""}
              className={input}
            />
          </div>
          <div>
            <label className={label} htmlFor="phone">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              defaultValue={initial.phone ?? ""}
              className={input}
            />
          </div>
          <div>
            <label className={label} htmlFor="role">
              Role
            </label>
            <input
              id="role"
              name="role"
              placeholder="e.g. Cleaner, Painter"
              defaultValue={initial.role ?? ""}
              className={input}
            />
          </div>
          <div>
            <label className={`${label} flex items-center gap-1`} htmlFor="language">
              Language
              <InfoTip text="Emails we send them, and the pages those emails open, use this language. Anything typed by staff (notes, job names) stays as typed." />
            </label>
            <select id="language" name="language" defaultValue={initial.language} className={input}>
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="status">
              Status
            </label>
            <select id="status" name="status" defaultValue={initial.status} className={input}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="runsWithoutSupervisor"
              name="runsWithoutSupervisor"
              type="checkbox"
              defaultChecked={initial.runsWithoutSupervisor}
              className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
            />
            <label htmlFor="runsWithoutSupervisor" className="text-sm text-gray-700">
              Runs jobs without a supervisor
            </label>
            <InfoTip text="Jobs and days this sub is on won't be flagged as needing a supervisor on the schedule, dashboard, or nudge emails." />
          </div>
        </div>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        {ok ? <p className="text-xs text-emerald-600">{ok}</p> : null}
        <div className="flex items-center gap-3">
          <Button size="md" type="submit"
            disabled={loading}>
            {loading ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
  );
}
