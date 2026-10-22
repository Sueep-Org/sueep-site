"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, InfoTip, Modal, inputClass, useToast } from "@/app/erp/components/ui";
import type { UnlinkedBid } from "@/lib/erp/subBidLinks";

function BidPickRow({ bid, checked, onToggle }: { bid: UnlinkedBid; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-gray-50">
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" />
      <span className="min-w-0 flex-1 text-sm">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-gray-900">{bid.bidder}</span>
          <span className="text-gray-700">{bid.amount}</span>
          {bid.matchReason ? (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{bid.matchReason}</span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-gray-500">
          <Link href={`/erp/projects/${bid.projectId}?tab=Proposals`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            {bid.projectTitle}
          </Link>
          {bid.receivedOn ? ` · ${bid.receivedOn}` : ""}
          {bid.contact ? ` · ${bid.contact}` : ""}
        </span>
      </span>
    </label>
  );
}

/** Links bids logged before this sub had a profile. Suggested matches show up front; anything else is found through the picker. */
export function ContractorBidLinker({ contractorId, unlinked }: { contractorId: string; unlinked: UnlinkedBid[] }) {
  const router = useRouter();
  const toast = useToast();
  const suggested = unlinked.filter((b) => b.matchReason);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(suggested.map((b) => b.id)));
  const [pickerPicked, setPickerPicked] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? unlinked.filter((b) => `${b.bidder} ${b.contact} ${b.projectTitle}`.toLowerCase().includes(q)) : unlinked;
  }, [unlinked, query]);

  const toggleIn = (setter: typeof setPicked) => (id: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggle = toggleIn(setPicked);
  const togglePicker = toggleIn(setPickerPicked);

  async function link(ids: string[]) {
    if (ids.length === 0) return;
    setSaving(true);
    const res = await fetch(`/api/erp/contractors/${contractorId}/bid-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidIds: ids }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      toast(data.error ?? "Could not link.");
      return;
    }
    toast(`Linked ${data.linked} bid${data.linked === 1 ? "" : "s"}.`, "success");
    setPickerOpen(false);
    router.refresh();
  }

  if (unlinked.length === 0) return null;
  const pickedSuggested = suggested.filter((b) => picked.has(b.id)).map((b) => b.id);

  return (
    <>
      {suggested.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-amber-200">
          <div className="flex items-center justify-between gap-3 bg-amber-50 px-3 py-2">
            <p className="flex items-center gap-1 text-sm font-medium text-amber-900">
              {suggested.length} past bid{suggested.length === 1 ? "" : "s"} may be from this sub
              <InfoTip text="Logged before they had a profile, with the same email, phone, name or company as this profile. Uncheck any that aren't theirs." wide />
            </p>
            <Button size="xs" onClick={() => link(pickedSuggested)} disabled={saving || pickedSuggested.length === 0}>
              Link {pickedSuggested.length}
            </Button>
          </div>
          <div className="divide-y divide-gray-100">
            {suggested.map((b) => (
              <BidPickRow key={b.id} bid={b} checked={picked.has(b.id)} onToggle={() => toggle(b.id)} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button variant="secondary" size="xs" onClick={() => { setPickerPicked(new Set()); setQuery(""); setPickerOpen(true); }}>
          Link past bids
        </Button>
      </div>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} size="lg">
        <div className="space-y-3">
          <p className="flex items-center gap-1 text-base font-semibold text-gray-900">
            Link past bids
            <InfoTip text="Bids logged on projects for a sub with no profile. Pick the ones from this sub." wide />
          </p>
          <input className={inputClass.sm} placeholder="Search name, company, email, project" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-gray-500">No bids match.</p>
            ) : (
              filtered.map((b) => <BidPickRow key={b.id} bid={b} checked={pickerPicked.has(b.id)} onToggle={() => togglePicker(b.id)} />)
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => link([...pickerPicked])} disabled={saving || pickerPicked.size === 0}>
              {saving ? "Linking..." : `Link ${pickerPicked.size}`}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
