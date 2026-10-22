"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { Button, InfoTip, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import type { PastBidder } from "@/lib/erp/subBidLinks";
import type { ContractorBidLine, ContractorBidSummary } from "@/lib/erp/subBidStats";
import { ContractorBidsSection, vsLowestText } from "./[id]/ContractorBidsSection";

export type BidderRow = PastBidder & { lines: ContractorBidLine[]; summary: ContractorBidSummary };

/** Green when they usually come in under the other subs, amber a bit over, red well over. */
function usuallyClass(pct: number | null): string {
  if (pct == null) return "text-gray-400";
  if (pct <= 0) return "text-emerald-700";
  return pct >= 10 ? "text-red-600" : "text-amber-600";
}

type ProfileForm = { name: string; contactName: string; email: string; phone: string; role: string };

/** Contractors page, Bidders tab: subs who bid but have no profile yet, one row per sub. */
export function BiddersTab({ bidders }: { bidders: BidderRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [making, setMaking] = useState<BidderRow | null>(null);
  const [form, setForm] = useState<ProfileForm>({ name: "", contactName: "", email: "", phone: "", role: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? bidders.filter((b) => [b.bidderName, b.bidderCompany, b.bidderEmail, b.bidderPhone].some((v) => v?.toLowerCase().includes(q)))
      : bidders;
    return [...list].sort((a, b) => (b.lastBidOn ?? "").localeCompare(a.lastBidOn ?? ""));
  }, [bidders, query]);

  function startProfile(b: BidderRow) {
    setMaking(b);
    setForm({
      name: b.bidderCompany ?? b.bidderName ?? "",
      contactName: b.bidderName ?? "",
      email: b.bidderEmail ?? "",
      phone: b.bidderPhone ?? "",
      role: "",
    });
    setError("");
  }

  async function createProfile() {
    if (!making) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/erp/sub-bidders/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: making.key, ...form }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaving(false);
      setError(data.error ?? "Could not create the profile.");
      return;
    }
    router.push(`/erp/contractors/${data.id}?tab=Bids`);
  }

  const set = (k: keyof ProfileForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (bidders.length === 0) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
        No bidders yet. Subs who bid under &quot;No profile yet&quot; on a project&apos;s Proposals tab show up here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1 text-sm text-gray-600">
          Subs who bid but don&apos;t have a profile yet
          <InfoTip text="One row per sub: bids with the same email, or the same name and company, are grouped. Create a profile to work with them; their bids move onto it." wide />
        </p>
        <input className={`${inputClass.xs} w-56`} placeholder="Search name, company, email" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
            <tr>
              <th className="px-4 py-2">Sub</th>
              <th className="px-4 py-2">Contact</th>
              <th className="px-4 py-2 text-right">Bids</th>
              <th className="px-4 py-2">Last bid</th>
              <th className="px-4 py-2" title="On average, how their bids compare with the cheapest other sub on the same work">Usually</th>
              <th className="px-4 py-2 text-right">Avg margin</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((b, i) => {
              const open = openKey === b.key;
              return (
                <Fragment key={b.key}>
                  <tr className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} cursor-pointer hover:bg-gray-100`} onClick={() => setOpenKey(open ? null : b.key)}>
                    <td className="px-4 py-3">
                      <span className="mr-1 inline-block w-3 text-gray-400">{open ? "▾" : "▸"}</span>
                      <span className="font-medium text-gray-900">{b.bidderCompany ?? b.bidderName}</span>
                      {b.bidderCompany && b.bidderName ? <span className="ml-1 text-xs text-gray-500">{b.bidderName}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {b.bidderEmail ? (
                        <a href={`mailto:${b.bidderEmail}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{b.bidderEmail}</a>
                      ) : null}
                      {b.bidderEmail && b.bidderPhone ? <br /> : null}
                      {b.bidderPhone ? <span className="text-gray-500">{b.bidderPhone}</span> : null}
                      {!b.bidderEmail && !b.bidderPhone ? "-" : null}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{b.bidCount}</td>
                    <td className="px-4 py-3 text-gray-500">{b.lastBidOn ?? "-"}</td>
                    <td className={`px-4 py-3 font-medium ${usuallyClass(b.summary.avgVsLowestPct)}`}>{vsLowestText(b.summary.avgVsLowestPct)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{b.summary.avgMarginPct == null ? "-" : `${Math.round(b.summary.avgMarginPct)}%`}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="secondary" size="xs" onClick={(e) => { e.stopPropagation(); startProfile(b); }}>
                        Create profile
                      </Button>
                    </td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={7} className="border-b border-gray-200 bg-white px-4 py-4">
                        <ContractorBidsSection lines={b.lines} summary={b.summary} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">No bidders match.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={making != null} onClose={() => setMaking(null)} size="md">
        <div className="space-y-3">
          <p className="text-base font-semibold text-gray-900">Create profile</p>
          <p className="text-xs text-gray-500">
            Their {making?.bidCount} bid{making?.bidCount === 1 ? "" : "s"} will move onto the new profile.
          </p>
          <div>
            <label className={labelClass.default}>Profile name</label>
            <input className={inputClass.md} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass.default}>Contact name</label>
              <input className={inputClass.md} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </div>
            <div>
              <label className={labelClass.default}>Role</label>
              <input className={inputClass.md} placeholder="e.g. Painter" value={form.role} onChange={(e) => set("role", e.target.value)} />
            </div>
            <div>
              <label className={labelClass.default}>Email</label>
              <input className={inputClass.md} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className={labelClass.default}>Phone</label>
              <input className={inputClass.md} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMaking(null)}>Cancel</Button>
            <Button size="sm" onClick={createProfile} disabled={saving}>{saving ? "Creating..." : "Create profile"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
