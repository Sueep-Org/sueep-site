"use client";

import { useHolidays } from "@/app/components/HolidaysProvider";

/** A short note under a date field when the picked day is a company holiday. Doesn't block saving. */
export function HolidayHint({ value }: { value: string | null | undefined }) {
  const { holidayOn } = useHolidays();
  const holiday = holidayOn(value);
  if (!holiday) return null;
  return (
    <p className="mt-1 text-xs font-medium text-amber-700" role="note">
      ⚠ {holiday}, company holiday. Nobody should be working that day.
    </p>
  );
}
