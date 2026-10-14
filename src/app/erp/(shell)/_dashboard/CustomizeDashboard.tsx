"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@/app/erp/components/ui";
import type { ErpRole } from "@/lib/erpSession";
import { CARD_TABS, CARD_TAB_LABELS, orderCards, roleCardsForTab, type CardTab, type DashboardLayoutPrefs } from "@/lib/erp/dashboardCards";

/**
 * Customize button and panel: show/hide and reorder your own cards within
 * each tab, and pick the tab the dashboard opens on. Cards can't move to
 * another tab, so the 3-per-tab limit always holds. Every change saves right
 * away (to your login only) and the page refreshes behind the panel.
 */
export function CustomizeDashboard({
  role,
  prefs,
  startTabOptions,
}: {
  role: ErpRole;
  prefs: DashboardLayoutPrefs;
  /** Tabs this person can open on, with labels, in tab-row order. */
  startTabOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tabs = CARD_TABS.map((tab) => ({ tab, cards: orderCards(roleCardsForTab(role, tab), prefs.cardOrder[tab]) })).filter((t) => t.cards.length > 0);
  if (!tabs.length) return null;
  const hidden = new Set(prefs.hiddenCards);
  const isCustom = prefs.hiddenCards.length > 0 || Object.keys(prefs.cardOrder).length > 0 || !!prefs.startTab;

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/erp/dashboard-prefs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError("Couldn't save. Try again.");
      return;
    }
    router.refresh();
  }

  function toggle(id: string) {
    const next = hidden.has(id) ? prefs.hiddenCards.filter((h) => h !== id) : [...prefs.hiddenCards, id];
    void save({ hiddenCards: next });
  }

  function move(tab: CardTab, ids: string[], index: number, dir: -1 | 1) {
    const next = [...ids];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    void save({ cardOrder: { ...prefs.cardOrder, [tab]: next } });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-900">
        Customize
      </button>
      <Modal open={open} onClose={() => setOpen(false)} size="lg">
        <div className="space-y-5 p-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Customize your dashboard</h2>
            <p className="mt-0.5 text-xs text-gray-500">Only changes it for you. Saves right away.</p>
          </div>

          {tabs.map(({ tab, cards }) => {
            const ids = cards.map((c) => c.id);
            return (
              <section key={tab}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{CARD_TAB_LABELS[tab]} tab</h3>
                <ul className="mt-1.5 divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {cards.map((card, i) => (
                    <li key={card.id} className="flex items-center gap-3 px-3 py-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={!hidden.has(card.id)}
                          disabled={saving}
                          onChange={() => toggle(card.id)}
                          className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                        />
                        <span className={`truncate text-sm ${hidden.has(card.id) ? "text-gray-400" : "text-gray-800"}`}>{card.title}</span>
                      </label>
                      {cards.length > 1 && (
                        <span className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            aria-label={`Move ${card.title} up`}
                            disabled={saving || i === 0}
                            onClick={() => move(tab, ids, i, -1)}
                            className="rounded border border-gray-200 px-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${card.title} down`}
                            disabled={saving || i === cards.length - 1}
                            onClick={() => move(tab, ids, i, 1)}
                            className="rounded border border-gray-200 px-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                          >
                            ↓
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {cards.every((c) => hidden.has(c.id)) && <p className="mt-1 text-xs text-gray-400">Every card is hidden, so this tab is hidden too.</p>}
              </section>
            );
          })}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Open the dashboard on</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Open the dashboard on">
              {[{ value: null, label: `Default (${startTabOptions[0]?.label ?? "first tab"})` }, ...startTabOptions].map((o) => {
                const current = prefs.startTab && startTabOptions.some((t) => t.value === prefs.startTab) ? prefs.startTab : null;
                const selected = current === o.value;
                return (
                  <button
                    key={o.value ?? "default"}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={saving || selected}
                    onClick={() => void save({ startTab: o.value })}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      selected ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </section>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <Button variant="secondary" size="sm" disabled={saving || !isCustom} onClick={() => void save({ reset: true })}>
              Reset to default
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
