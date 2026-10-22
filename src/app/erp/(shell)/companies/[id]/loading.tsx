import { GcScorecardSkeleton } from "./GcScorecard";

/** Shows at once when a company opens (for example from the deal panel's Scorecard link). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-56 animate-pulse rounded bg-gray-100" />
      <div className="grid gap-4 lg:grid-cols-2">
        <GcScorecardSkeleton />
      </div>
    </div>
  );
}
