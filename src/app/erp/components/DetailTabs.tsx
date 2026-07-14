"use client";

import { useEffect, useState } from "react";

type Tab = {
  label: string;
  content: React.ReactNode;
};

type Props = {
  tabs: Tab[];
  /** URL query param to sync the active tab to. Defaults to "tab" — override when nesting DetailTabs so the outer and inner switchers don't collide on the same param. */
  paramName?: string;
};

export function DetailTabs({ tabs, paramName = "tab" }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  // On mount, read the URL param and jump to that tab.
  useEffect(() => {
    const label = new URLSearchParams(window.location.search).get(paramName);
    if (!label) return;
    const idx = tabs.findIndex((t) => t.label === label);
    if (idx >= 0) setActiveIndex(idx);
    // tabs labels are stable across renders; effect only needs to run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setTab(index: number) {
    setActiveIndex(index);
    const params = new URLSearchParams(window.location.search);
    params.set(paramName, tabs[index].label);
    history.replaceState(null, "", `?${params.toString()}`);
  }

  const activeTab = tabs[activeIndex];

  return (
    <div>
      {/* Mobile: native select — one tap to switch, no wrapping pill mess */}
      <div className="sm:hidden mb-4">
        <select
          value={activeTab?.label ?? ""}
          onChange={(e) => {
            const idx = tabs.findIndex((t) => t.label === e.target.value);
            if (idx >= 0) setTab(idx);
          }}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        >
          {tabs.map((tab) => (
            <option key={tab.label} value={tab.label}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: sticky pill bar — stays visible as you scroll */}
      <div className="hidden sm:flex sticky top-0 z-10 bg-white flex-wrap gap-2 border-b border-gray-200 pb-3 mb-6 pt-1">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setTab(i)}
            className={
              i === activeIndex
                ? "rounded-full bg-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-800"
                : "rounded-full px-4 py-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>{activeTab?.content}</div>
    </div>
  );
}
