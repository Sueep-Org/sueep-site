"use client";

import { createContext, useContext } from "react";
import { DEFAULT_PRICING_SETTINGS, type PricingSettings } from "@/lib/pricingSettings";

const PricingSettingsContext = createContext<PricingSettings | null>(null);

/** Hands the Settings page prices (loaded on the server) to client components below it. */
export function PricingSettingsProvider({ value, children }: { value: PricingSettings; children: React.ReactNode }) {
  return <PricingSettingsContext.Provider value={value}>{children}</PricingSettingsContext.Provider>;
}

export function usePricingSettings(): PricingSettings {
  const value = useContext(PricingSettingsContext);
  if (!value) {
    console.error("usePricingSettings outside PricingSettingsProvider, using defaults");
    return DEFAULT_PRICING_SETTINGS;
  }
  return value;
}
