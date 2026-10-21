"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import {
  HIRING_SOURCES,
  OFFICE_STAGES,
  hiringSourceLabel,
  officeStageMeta,
  phoneKey,
  type OfficeStage,
} from "@/lib/erp/officeHiring";
import { patchCandidate } from "./OfficeCandidateControls";

export type OpeningCandidate = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  expectedSalary: string | null;
  stage: OfficeStage;
  shortlisted: boolean;
  source: string | null;
  createdAt: string;
};

/** Off to the side of the pipeline: collapsed into one "Out" column on the board. */
const OUT_STAGES: readonly OfficeStage[] = ["REJECTED", "WITHDREW"];
const BOARD_STAGES = OFFICE_STAGES.filter((s) => !OUT_STAGES.includes(s.value));
const OUT_COLUMNS = OFFICE_STAGES.filter((s) => OUT_STAGES.includes(s.value));

const stageIndex = (s: OfficeStage) => OFFICE_STAGES.findIndex((x) => x.value === s);

/** Everything the card leaves out, for its hover text. */
function details(c: OpeningCandidate): string {
  return [
    c.fullName,
    c.phone,
    c.email,
    c.location,
    c.expectedSalary && `Expected: ${c.expectedSalary}`,
    c.source && `Source: ${hiringSourceLabel(c.source)}`,
    `Added ${new Date(c.createdAt).toLocaleDateString()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Candidates on one opening, as a stage board (drag a card, or use its menu,
 * to move it) or a table. Filters and the view live in the URL so a link or
 * refresh keeps them. Moves and stars save right away and roll back on error.
 */
export function OpeningCandidatesView({ initial }: { initial: OpeningCandidate[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();

  const [rows, setRows] = useState(initial);
  // Server data wins after a refresh (e.g. a candidate added in the modal).
  useEffect(() => setRows(initial), [initial]);

  const view = params.get("view") === "table" ? "table" : "board";
  const shortlistedOnly = params.get("shortlisted") === "1";
  const source = params.get("source") ?? "";
  const stageFilter = params.get("stage") ?? "";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [showOut, setShowOut] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Search stays local while typing; written to the URL after a pause.
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onQuery(v: string) {
    setQuery(v);
    if (queryTimer.current) clearTimeout(queryTimer.current);
    queryTimer.current = setTimeout(() => setParam("q", v.trim()), 400);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qPhone = phoneKey(q);
    return rows
      .filter((c) => !shortlistedOnly || c.shortlisted)
      .filter((c) => !source || c.source === source)
      .filter((c) => !stageFilter || c.stage === stageFilter)
      .filter(
        (c) =>
          !q ||
          c.fullName.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (qPhone.length >= 3 && phoneKey(c.phone).includes(qPhone)),
      )
      .sort(
        (a, b) =>
          Number(b.shortlisted) - Number(a.shortlisted) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [rows, shortlistedOnly, source, stageFilter, query]);

  async function update(id: string, change: Partial<Pick<OpeningCandidate, "stage" | "shortlisted">>) {
    const before = rows.find((r) => r.id === id);
    if (!before) return;
    if (Object.entries(change).every(([k, v]) => before[k as keyof OpeningCandidate] === v)) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...change } : r)));
    const err = await patchCandidate(id, change);
    if (err) {
      setRows((prev) => prev.map((r) => (r.id === id ? before : r)));
      toast(err, "error");
      return;
    }
    if (change.stage) router.refresh();
  }

  const filtersActive = shortlistedOnly || !!source || !!stageFilter || !!query.trim();
  const outCount = filtered.filter((c) => OUT_STAGES.includes(c.stage)).length;
  const columns = showOut || (stageFilter && OUT_STAGES.includes(stageFilter as OfficeStage)) ? [...BOARD_STAGES, ...OUT_COLUMNS] : BOARD_STAGES;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-semibold text-gray-900">
          Candidates{" "}
          <span className="font-normal text-gray-500">
            ({filtered.length}
            {filtered.length !== rows.length ? ` of ${rows.length}` : ""})
          </span>
        </h2>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search name, phone, email…"
          aria-label="Search candidates"
          className="w-52 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
        <button
          type="button"
          onClick={() => setParam("shortlisted", shortlistedOnly ? "" : "1")}
          aria-pressed={shortlistedOnly}
          className={`rounded-md border px-2.5 py-1.5 text-xs ${
            shortlistedOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          ★ Shortlisted
        </button>
        <SearchableSelect
          className="w-36"
          value={source}
          onChange={(v) => setParam("source", v)}
          options={HIRING_SOURCES.map((s) => ({ value: s.value, label: s.label }))}
          placeholder="Any source"
          allLabel="Any source"
        />
        <SearchableSelect
          className="w-36"
          value={stageFilter}
          onChange={(v) => setParam("stage", v)}
          options={OFFICE_STAGES.map((s) => ({ value: s.value, label: s.label }))}
          placeholder="Any stage"
          allLabel="Any stage"
        />
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              const next = new URLSearchParams(params.toString());
              ["q", "shortlisted", "source", "stage"].forEach((k) => next.delete(k));
              const qs = next.toString();
              router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
            }}
            className="text-xs text-pink-600 hover:underline"
          >
            Clear
          </button>
        ) : null}
        <div className="ml-auto flex overflow-hidden rounded-md border border-gray-300 text-xs">
          {(["board", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setParam("view", v === "board" ? "" : v)}
              aria-pressed={view === v}
              className={`px-3 py-1.5 capitalize ${view === v ? "bg-pink-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          No candidates yet.
        </div>
      ) : view === "board" ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {columns
            .filter((col) => !stageFilter || col.value === stageFilter)
            .map((col) => (
              <StageColumn
                key={col.value}
                stage={col}
                cards={filtered.filter((c) => c.stage === col.value)}
                dragging={dragging}
                onDragStart={setDragging}
                onDragEnd={() => setDragging(null)}
                onDrop={(id) => void update(id, { stage: col.value })}
                onMove={(id, stage) => void update(id, { stage })}
                onStar={(id, on) => void update(id, { shortlisted: on })}
              />
            ))}
          {!stageFilter && !showOut ? (
            <button
              type="button"
              onClick={() => setShowOut(true)}
              className="flex w-12 shrink-0 flex-col items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 py-3 text-xs text-gray-500 hover:border-gray-300 hover:text-gray-800"
              title="Show Rejected and Withdrew"
            >
              <span className="[writing-mode:vertical-rl]">Rejected, withdrew</span>
              <span className="font-semibold">{outCount}</span>
            </button>
          ) : null}
          {showOut && !stageFilter ? (
            <button type="button" onClick={() => setShowOut(false)} className="self-start text-xs text-pink-600 hover:underline">
              Hide
            </button>
          ) : null}
        </div>
      ) : (
        <CandidateTable rows={[...filtered].sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage))} onMove={(id, stage) => void update(id, { stage })} onStar={(id, on) => void update(id, { shortlisted: on })} />
      )}
    </section>
  );
}

function StageColumn({
  stage,
  cards,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
  onMove,
  onStar,
}: {
  stage: (typeof OFFICE_STAGES)[number];
  cards: OpeningCandidate[];
  dragging: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
  onMove: (id: string, stage: OfficeStage) => void;
  onStar: (id: string, on: boolean) => void;
}) {
  const [over, setOver] = useState(false);
  const canDrop = !!dragging && !cards.some((c) => c.id === dragging);
  const tone = stage.value === "HIRED" ? "border-t-emerald-400" : OUT_STAGES.includes(stage.value) ? "border-t-gray-300" : "border-t-pink-300";
  return (
    <section
      onDragOver={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (canDrop && dragging) onDrop(dragging);
      }}
      className={`flex w-52 shrink-0 flex-col rounded-lg border border-t-4 bg-gray-50 ${tone} ${
        over && canDrop ? "border-pink-400 ring-2 ring-pink-200" : canDrop ? "border-dashed border-gray-300" : "border-gray-200"
      }`}
    >
      <header className="flex items-center justify-between border-b border-gray-200 px-2.5 py-2">
        <h3 className="truncate text-xs font-semibold text-gray-900">{stage.label}</h3>
        <span className="text-[11px] text-gray-500">{cards.length}</span>
      </header>
      <div className="max-h-[65vh] space-y-1.5 overflow-y-auto p-2">
        {cards.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-300">None</p>
        ) : (
          cards.map((c) => (
            <article
              key={c.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", c.id);
                onDragStart(c.id);
              }}
              onDragEnd={onDragEnd}
              title={details(c)}
              className={`cursor-grab rounded-md border bg-white px-2.5 py-2 shadow-sm active:cursor-grabbing ${
                dragging === c.id ? "opacity-40" : ""
              } ${c.shortlisted ? "border-amber-200" : "border-gray-200"}`}
            >
              <div className="flex items-start gap-1.5">
                <StarButton on={c.shortlisted} onToggle={() => onStar(c.id, !c.shortlisted)} />
                <Link href={`/erp/candidates/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 hover:underline">
                  {c.fullName}
                </Link>
                <MoveMenu current={c.stage} onMove={(s) => onMove(c.id, s)} />
              </div>
              {c.location || c.expectedSalary ? (
                <p className="mt-0.5 truncate pl-5 text-[11px] text-gray-500">
                  {[c.location, c.expectedSalary].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function StarButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "Remove from shortlist" : "Add to shortlist"}
      className={`shrink-0 text-sm leading-5 ${on ? "text-amber-400" : "text-gray-300 hover:text-amber-300"}`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

/** "..." on a card: move without dragging (keyboard, phones). */
function MoveMenu({ current, onMove }: { current: OfficeStage; onMove: (s: OfficeStage) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-label="Move to stage"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1 text-sm leading-5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        ⋯
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-36 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Move to</p>
          {OFFICE_STAGES.filter((s) => s.value !== current).map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                setOpen(false);
                onMove(s.value);
              }}
              className="block w-full rounded px-2 py-1 text-left text-xs text-gray-700 hover:bg-pink-50 hover:text-pink-700"
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CandidateTable({
  rows,
  onMove,
  onStar,
}: {
  rows: OpeningCandidate[];
  onMove: (id: string, stage: OfficeStage) => void;
  onStar: (id: string, on: boolean) => void;
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No matches.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b border-gray-300 bg-gray-200 text-xs uppercase text-gray-700">
          <tr>
            <th className="w-8 px-3 py-2" />
            <th className="px-4 py-2 font-semibold">Name</th>
            <th className="px-4 py-2 font-semibold">Phone</th>
            <th className="px-4 py-2 font-semibold">Email</th>
            <th className="px-4 py-2 font-semibold">Location</th>
            <th className="px-4 py-2 font-semibold">Expected salary</th>
            <th className="px-4 py-2 font-semibold">Source</th>
            <th className="px-4 py-2 font-semibold">Stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const meta = officeStageMeta(c.stage);
            return (
              <tr key={c.id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} transition-colors hover:bg-gray-100`}>
                <td className="px-3 py-2.5"><StarButton on={c.shortlisted} onToggle={() => onStar(c.id, !c.shortlisted)} /></td>
                <td className="px-4 py-2.5 font-medium">
                  <Link href={`/erp/candidates/${c.id}`} className="text-gray-800 hover:underline">{c.fullName}</Link>
                </td>
                <td className="px-4 py-2.5 text-gray-700">
                  {c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : "-"}
                </td>
                <td className="px-4 py-2.5 text-gray-700">
                  {c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : "-"}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{c.location || "-"}</td>
                <td className="max-w-[14rem] truncate px-4 py-2.5 text-gray-600" title={c.expectedSalary ?? undefined}>
                  {c.expectedSalary || "-"}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{c.source ? hiringSourceLabel(c.source) : "-"}</td>
                <td className="px-4 py-2.5">
                  <select
                    value={c.stage}
                    onChange={(e) => onMove(c.id, e.target.value as OfficeStage)}
                    aria-label="Stage"
                    className={`cursor-pointer rounded-full border-0 px-2 py-0.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-offset-1 ${meta.cls}`}
                  >
                    {OFFICE_STAGES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
