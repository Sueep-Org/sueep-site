"use client";

import { useEffect, useRef, useState } from "react";

type SimpleTab = { label: string; content: React.ReactNode };
/** A hover-dropdown group — the group's own label is just a trigger, never itself selectable; only its children are. */
type GroupTab = { label: string; children: SimpleTab[] };
export type DetailTab = SimpleTab | GroupTab;

type Props = {
  tabs: DetailTab[];
  /** URL query param to sync the active tab to. Defaults to "tab" — override when nesting DetailTabs so the outer and inner switchers don't collide on the same param. */
  paramName?: string;
};

function isGroupTab(t: DetailTab): t is GroupTab {
  return "children" in t;
}

function flattenTabs(tabs: DetailTab[]): SimpleTab[] {
  return tabs.flatMap((t) => (isGroupTab(t) ? t.children : [t]));
}

export function DetailTabs({ tabs, paramName = "tab" }: Props) {
  const flatTabs = flattenTabs(tabs);
  const [activeLabel, setActiveLabel] = useState(flatTabs[0]?.label ?? "");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount, read the URL param and jump to that tab.
  useEffect(() => {
    const label = new URLSearchParams(window.location.search).get(paramName);
    if (!label) return;
    if (flatTabs.some((t) => t.label === label)) setActiveLabel(label);
    // tabs labels are stable across renders; effect only needs to run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTab(label: string) {
    setActiveLabel(label);
    setOpenGroup(null);
    const params = new URLSearchParams(window.location.search);
    params.set(paramName, label);
    history.replaceState(null, "", `?${params.toString()}`);
  }

  function openGroupNow(label: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenGroup(label);
  }

  function scheduleCloseGroup() {
    closeTimer.current = setTimeout(() => setOpenGroup(null), 150);
  }

  const activeContent = flatTabs.find((t) => t.label === activeLabel)?.content;

  return (
    <div>
      {/* Mobile: native select — one tap to switch, no wrapping pill mess or hover menus */}
      <div className="sm:hidden mb-4">
        <select
          value={activeLabel}
          onChange={(e) => selectTab(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        >
          {tabs.map((tab) =>
            isGroupTab(tab) ? (
              <optgroup key={tab.label} label={tab.label}>
                {tab.children.map((child) => (
                  <option key={child.label} value={child.label}>
                    {child.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={tab.label} value={tab.label}>
                {tab.label}
              </option>
            )
          )}
        </select>
      </div>

      {/* Desktop: sticky pill bar — stays visible as you scroll */}
      <div className="hidden sm:flex sticky top-0 z-10 bg-white flex-wrap gap-2 border-b border-gray-200 pb-3 mb-6 pt-1">
        {tabs.map((tab) => {
          if (isGroupTab(tab)) {
            const isChildActive = tab.children.some((child) => child.label === activeLabel);
            const isOpen = openGroup === tab.label;
            return (
              <div
                key={tab.label}
                className="relative"
                onMouseEnter={() => openGroupNow(tab.label)}
                onMouseLeave={scheduleCloseGroup}
              >
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : tab.label)}
                  className={
                    isChildActive || isOpen
                      ? "rounded-full bg-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-800"
                      : "rounded-full px-4 py-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                  }
                >
                  {tab.label}
                </button>
                {isOpen && (
                  <div className="absolute left-0 z-20 mt-1 min-w-[9rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    {tab.children.map((child) => (
                      <button
                        key={child.label}
                        type="button"
                        onClick={() => selectTab(child.label)}
                        className={`block w-full px-4 py-2 text-left text-sm ${
                          child.label === activeLabel ? "font-semibold text-pink-600" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => selectTab(tab.label)}
              className={
                tab.label === activeLabel
                  ? "rounded-full bg-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-800"
                  : "rounded-full px-4 py-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div>{activeContent}</div>
    </div>
  );
}
