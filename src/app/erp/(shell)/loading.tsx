/**
 * Shows at once on every ERP page change while the server builds the page,
 * inside the shell so the menu stays put. Pages with their own loading.tsx
 * (companies/[id]) use theirs.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-24 animate-pulse rounded-xl border border-gray-100 bg-white shadow-sm lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-xl border border-gray-100 bg-white shadow-sm" />
        <div className="h-64 animate-pulse rounded-xl border border-gray-100 bg-white shadow-sm" />
      </div>
    </div>
  );
}
