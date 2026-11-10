import { holidayOn } from "@/lib/erp/holidays";

/** A short note under a date field when the picked day is a company holiday. Doesn't block saving. */
export function HolidayHint({ value }: { value: string | null | undefined }) {
  const holiday = holidayOn(value);
  if (!holiday) return null;
  return (
    <p className="mt-1 text-xs font-medium text-amber-700" role="note">
      ⚠ {holiday}, company holiday. Nobody should be working that day.
    </p>
  );
}
