"use client";

import { useEffect, useRef, useState } from "react";

type SimpleTab = {
  /** Also the tab's key in the URL (?tab=Labor), so links into a tab keep working when it moves into a group. */
  label: string;
  /** Shorter name shown inside a group's menu, e.g. "Hourly" for the Labor tab under a Labor group. */
  menuLabel?: string;
  content: React.ReactNode;
};
/** A dropdown group — the group's own label is just a trigger, never itself selectable; only its children are. */
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

/** A group left with one tab (e.g. after a role filter) shows as that plain tab, and an empty one is dropped. */
function collapseSmallGroups(tabs: DetailTab[]): DetailTab[] {
  return tabs.flatMap((t) => (isGroupTab(t) && t.children.length < 2 ? t.children.map(({ label, content }) => ({ label, content })) : [t]));
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
  );
}

export function DetailTabs({ tabs: rawTabs, paramName = "tab" }: Props) {
  const tabs = collapseSmallGroups(rawTabs);
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

  // Tapping or clicking anywhere else, or Escape, closes an open group menu
  // (touch screens have no "mouse leave" to do it).
  useEffect(() => {
    if (!openGroup) return;
    function onPointerDown(e: PointerEvent) {
      if (!(e.target as Element | null)?.closest?.("[data-tab-group]")) setOpenGroup(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenGroup(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openGroup]);

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
                  // The closed select shows only the option's text, so a
                  // renamed tab carries its group ("Labor: Hourly").
                  <option key={child.label} value={child.label}>
                    {child.menuLabel && child.menuLabel !== child.label ? `${tab.label}: ${child.menuLabel}` : child.label}
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
            const activeChild = tab.children.find((child) => child.label === activeLabel);
            const isOpen = openGroup === tab.label;
            return (
              <div
                key={tab.label}
                data-tab-group
                className="relative"
                // Hover opens it for a mouse only. A tap also fires "enter",
                // which would open the menu just before the click toggled it shut.
                onPointerEnter={(e) => e.pointerType === "mouse" && openGroupNow(tab.label)}
                onPointerLeave={(e) => e.pointerType === "mouse" && scheduleCloseGroup()}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onClick={() => setOpenGroup(isOpen ? null : tab.label)}
                  className={
                    activeChild || isOpen
                      ? "flex items-center gap-1.5 rounded-full bg-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-800"
                      : "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                  }
                >
                  {tab.label}
                  {activeChild && <span className="font-normal text-gray-600">· {activeChild.menuLabel ?? activeChild.label}</span>}
                  <Chevron open={isOpen} />
                </button>
                {isOpen && (
                  <div role="menu" className="absolute left-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    {tab.children.map((child) => (
                      <button
                        key={child.label}
                        type="button"
                        onClick={() => selectTab(child.label)}
                        className={`block w-full px-4 py-2 text-left text-sm ${
                          child.label === activeLabel ? "font-semibold text-pink-600" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {child.menuLabel ?? child.label}
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
