"use client";

import { createContext, useContext } from "react";
import { DEFAULT_APP_LISTS, type AppLists } from "@/lib/erp/appLists";

const AppListsContext = createContext<AppLists | null>(null);

/** Hands the Settings page lists (loaded on the server) to client components below it. */
export function AppListsProvider({ value, children }: { value: AppLists; children: React.ReactNode }) {
  return <AppListsContext.Provider value={value}>{children}</AppListsContext.Provider>;
}

export function useAppLists(): AppLists {
  const value = useContext(AppListsContext);
  if (!value) {
    console.error("useAppLists outside AppListsProvider, using defaults");
    return DEFAULT_APP_LISTS;
  }
  return value;
}
