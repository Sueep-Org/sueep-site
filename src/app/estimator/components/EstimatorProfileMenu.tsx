"use client";

import { useState } from "react";
import Link from "next/link";
import { useEstimatorAuth } from "@/lib/estimatorAuthContext";

export function EstimatorProfileMenu() {
  const { user, signOut } = useEstimatorAuth();
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  if (!user) return null;
  const label = user.displayName || user.email;
  const initials = (user.displayName || user.email)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Keyed by user.id so switching accounts on the same device resets the
  // "avatar failed to load" fallback instead of getting stuck showing the
  // previous account's initials (or a broken image) forever.
  const avatar = !avatarFailed ? (
    <img
      key={user.id}
      src="/api/estimator/avatar"
      alt=""
      onError={() => setAvatarFailed(true)}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    initials
  );

  return (
    <div className="relative z-20 ml-2">
      <button
        type="button"
        aria-label="Open profile menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-pink-600 text-xs font-semibold text-white"
      >
        {avatar}
      </button>
      {open ? (
        <div className="absolute right-2 top-11 z-10 w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-600 text-xs font-semibold text-white">
              {avatar}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{label}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <Link
            href="/estimator/settings"
            onClick={() => setOpen(false)}
            className="mt-4 block w-full rounded-md border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            Settings
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
