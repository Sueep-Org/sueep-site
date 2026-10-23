"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import type { BoardCard, BoardColumn } from "@/lib/erp/pipelineBoard";
import { PRIORITIES } from "@/lib/erp/pipelineUi";

type Action = "owner" | "priority" | "move" | "lost";
type Option = { value: string; label: string };
type Result = { id: string; name: string; error: string | null };

const MAX = 50;

/** Shown above the table while deals are ticked: pick a change, apply it to all of them. */
export function BulkBar({
  pipeline,
  cards,
  columns,
  owners,
  reasons,
  onClear,
}: {
  pipeline: "post-con" | "janitorial";
  /** The ticked deals */
  cards: BoardCard[];
  columns: BoardColumn[];
  owners: Option[];
  reasons: Option[];
  onClear: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [action, setAction] = useState<Action>("owner");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Result[] | null>(null);

  const openStages = columns.filter((c) => c.outcome === "open").map((c) => ({ value: c.stageId, label: c.label }));
  const choices: Record<Action, { label: string; options: Option[]; blank?: string }> = {
    owner: { label: "Change owner", options: owners, blank: "No owner" },
    priority: { label: "Set priority", options: [...PRIORITIES], blank: "No priority" },
    move: { label: "Move to", options: openStages },
    lost: { label: "Mark lost", options: reasons },
  };
  const c = choices[action];
  const needsValue = action === "move" || action === "lost";
  const tooMany = cards.length > MAX;

  async function apply() {
    const what = action === "move" || action === "lost" ? c.options.find((o) => o.value === value)?.label : value ? c.options.find((o) => o.value === value)?.label : c.blank;
    const ok = await confirm({
      title: `${c.label} for ${cards.length} deal${cards.length === 1 ? "" : "s"}?`,
      message: `${c.label}: ${what}. This saves to HubSpot for each deal. Deals that can't be changed are skipped and listed.`,
      confirmLabel: "Apply",
      danger: action === "lost",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch("/api/erp/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline, action, value, deals: cards.map((d) => ({ id: d.id, stageId: d.stageId, name: d.name })) }),
    }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => null)) as { error?: string; results?: Result[] } | null;
    if (!res?.ok || !data?.results) return toast(data?.error ?? "Couldn't apply. Try again.", "error");
    const failed = data.results.filter((r) => r.error);
    const done = data.results.length - failed.length;
    toast(`${done} deal${done === 1 ? "" : "s"} updated${failed.length ? `, ${failed.length} skipped` : ""}.`, failed.length ? "error" : "success");
    if (failed.length) setRefused(failed);
    else onClear();
    router.refresh();
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-xs">
      <span className="font-semibold text-pink-800">{cards.length} selected</span>
      <select
        value={action}
        onChange={(e) => {
          setAction(e.target.value as Action);
          setValue("");
        }}
        aria-label="What to change"
        className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs"
      >
        {(Object.keys(choices) as Action[]).map((a) => (
          <option key={a} value={a}>{choices[a].label}</option>
        ))}
      </select>
      <div className="w-56">
        <SearchableSelect value={value} onChange={setValue} options={c.options} allLabel={c.blank ?? "Pick one"} placeholder={c.blank ?? "Pick one"} />
      </div>
      <Button size="xs" onClick={apply} disabled={busy || tooMany || (needsValue && !value)}>
        {busy ? "Saving…" : "Apply"}
      </Button>
      <button type="button" onClick={onClear} className="text-gray-500 hover:text-gray-800">
        Clear
      </button>
      {tooMany && <span className="text-red-600">At most {MAX} at a time.</span>}
      {action === "move" && <span className="text-gray-500">Open stages only. Won and lost go one card at a time.</span>}

      {refused && (
        <Modal open onClose={() => setRefused(null)} size="md">
          <div className="space-y-3 p-5">
            <h2 className="text-base font-semibold text-gray-900">Skipped deals</h2>
            <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
              {refused.map((r) => (
                <li key={r.id}>
                  <p className="font-medium text-gray-900">{r.name}</p>
                  <p className="text-xs text-red-700">{r.error}</p>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setRefused(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
