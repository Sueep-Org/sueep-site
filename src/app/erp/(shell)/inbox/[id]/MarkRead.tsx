"use client";

import { useEffect } from "react";
import { INBOX_CHANGED_EVENT } from "../areas";

/** Marks the email read once it's actually open (not on a link prefetch), then updates the menu badge. */
export function MarkRead({ id }: { id: string }) {
  useEffect(() => {
    fetch("/api/erp/inbox/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) })
      .then((res) => {
        if (res.ok) window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
      })
      .catch(() => {});
  }, [id]);
  return null;
}
