export type Stat = { label: string; value: string; hint?: string; tone?: string; title?: string };

/** One compact bar of summary numbers, split into cells. Used at the top of
 * each Janitorial Contracts tab and the contract page. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl
      className="grid gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 shadow-sm"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(9.5rem, 1fr))` }}
    >
      {stats.map((s) => (
        <div key={s.label} className="bg-white px-3 py-2" title={s.title}>
          <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500">{s.label}</dt>
          <dd className="flex flex-wrap items-baseline gap-x-1.5">
            <span className={`text-base font-semibold tabular-nums ${s.tone ?? "text-gray-900"}`}>{s.value}</span>
            {s.hint && <span className="truncate text-[11px] text-gray-400">{s.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
