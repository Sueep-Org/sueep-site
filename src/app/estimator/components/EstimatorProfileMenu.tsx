"use client";

import { useState } from "react";
import { useEstimatorAuth } from "@/lib/estimatorAuthContext";

export function EstimatorProfileMenu() {
  const { user, signOut } = useEstimatorAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const label = user.displayName || user.email;
  const initials = (user.displayName || user.email).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button type="button" aria-label="Open profile menu" onClick={() => setOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-600 text-xs font-semibold text-white">
        {initials}
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-10 w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
          <p className="truncate text-sm font-semibold">{label}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <button type="button" onClick={signOut} className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50">Sign out</button>
        </div>
      ) : null}
    </div>
  );
}