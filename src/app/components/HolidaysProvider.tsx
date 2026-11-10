"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_COMPANY_HOLIDAYS, makeHolidayHelpers, type CompanyHoliday, type HolidayHelpers } from "@/lib/erp/holidays";

const HolidaysContext = createContext<CompanyHoliday[] | null>(null);

/** Hands the company holidays (loaded on the server) to client components below it. */
export function HolidaysProvider({ value, children }: { value: CompanyHoliday[]; children: React.ReactNode }) {
  return <HolidaysContext.Provider value={value}>{children}</HolidaysContext.Provider>;
}

/** holidayOn / holidayConfirm / holidaysBetween over the saved list (the built-in list outside the ERP shell). */
export function useHolidays(): HolidayHelpers {
  const list = useContext(HolidaysContext) ?? DEFAULT_COMPANY_HOLIDAYS;
  return useMemo(() => makeHolidayHelpers(list), [list]);
}
