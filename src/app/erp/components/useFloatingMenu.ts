"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * Places a dropdown with position: fixed under (or, near the bottom of the
 * screen, above) its input, so a scrolling card or modal can't cut it off.
 * The menu stays in the same spot in the page, so outside-click checks keep
 * working. Spread the returned style on the menu.
 */
export function useFloatingMenu(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  /** Re-place when the list changes length */
  itemCount: number,
  minWidth = 192,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", top: 0, left: 0, visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const up = below < 180 && above > below;
      const maxHeight = Math.min(256, Math.max(120, up ? above : below));
      const height = Math.min(menu?.scrollHeight ?? maxHeight, maxHeight);
      let top = up ? r.top - 4 - height : r.bottom + 4;
      let left = r.left;
      // A transformed parent moves position: fixed. Measure where it really landed and correct.
      if (menu) {
        const m = menu.getBoundingClientRect();
        top -= m.top - (parseFloat(menu.style.top) || 0);
        left -= m.left - (parseFloat(menu.style.left) || 0);
      }
      setStyle({ position: "fixed", top, left, width: Math.max(r.width, minWidth), maxHeight, zIndex: 70 });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, anchorRef, menuRef, itemCount, minWidth]);

  return open ? style : { display: "none" };
}
