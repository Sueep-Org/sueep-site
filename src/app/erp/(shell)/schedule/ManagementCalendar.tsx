"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm } from "@/app/erp/components/ui";
import { dayKey, monthLabel, monthMatrix, startOfMonth } from "@/lib/erp/schedule";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { WEEKDAY_SHORT } from "@/lib/erp/janitorialSchedule";
import {
  BUILTIN_SOURCE,
  CATEGORY_COLORS,
  REPEAT_OPTIONS,
  addDaysKey,
  categoryColor,
  daysBetween,
  formatItemDates,
  formatRemindDays,
  type BuiltinKey,
  type ManagementCategoryDto,
  type ManagementItem,
  type RepeatValue,
} from "@/lib/erp/managementCalendar";
import { CollapsibleSection } from "./CollapsibleSection";

type Feed = { items: ManagementItem[]; categories: ManagementCategoryDto[] };
type EventForm = { kind: "new"; date: string } | { kind: "edit"; item: ManagementItem };

/** Chips shown in a day cell before the rest fold into "+N more". */
const MAX_CHIPS_PER_DAY = 3;
const UPCOMING_DAYS = 30;
const HIDDEN_KEY = "mgmtCalendarHiddenCategories";

const isOverdue = (item: ManagementItem, todayKey: string) => !!item.event && !item.done && item.end < todayKey;

async function sendJson(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return json.error ?? "Something went wrong";
  } catch {
    return "Network error";
  }
}

async function fetchFeed(start: string, end: string): Promise<Feed> {
  const res = await fetch(`/api/erp/management-calendar?start=${start}&end=${end}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Could not load the calendar");
  return json;
}

export function ManagementCalendar() {
  const todayKey = dayKey(todayEasternAsUtcMidnight());
  const [cursor, setCursor] = useState(() => startOfMonth(todayEasternAsUtcMidnight()));
  const [feed, setFeed] = useState<Feed | null>(null);
  const [upcoming, setUpcoming] = useState<ManagementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ManagementItem | null>(null);
  const [form, setForm] = useState<EventForm | null>(null);
  const [dayList, setDayList] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    function onDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [filterOpen]);

  const matrix = useMemo(() => monthMatrix(cursor), [cursor]);
  const cells = matrix.flat();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
      if (Array.isArray(saved)) setHidden(new Set(saved.map(String)));
    } catch {
      // Private window or blocked storage: start with everything shown.
    }
  }, []);

  function toggleCategory(id: string | null) {
    setHidden((prev) => {
      const next = id == null ? new Set<string>() : new Set(prev);
      if (id != null) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Not saved; the filter still works for this visit.
      }
      return next;
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const grid = monthMatrix(cursor).flat();
      // The Upcoming list also looks back a month for overdue manual events.
      const [month, soon] = await Promise.all([
        fetchFeed(dayKey(grid[0]), dayKey(grid[grid.length - 1])),
        fetchFeed(addDaysKey(todayKey, -UPCOMING_DAYS), addDaysKey(todayKey, UPCOMING_DAYS)),
      ]);
      setFeed(month);
      setUpcoming(soon.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the calendar");
    } finally {
      setLoading(false);
    }
  }, [cursor, todayKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => feed?.categories ?? [], [feed]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const visible = useCallback((i: ManagementItem) => !hidden.has(i.categoryId), [hidden]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ManagementItem[]>();
    const first = dayKey(cells[0]);
    const last = dayKey(cells[cells.length - 1]);
    for (const item of feed?.items ?? []) {
      if (!visible(item)) continue;
      for (let k = item.start < first ? first : item.start; k <= item.end && k <= last; k = addDaysKey(k, 1)) {
        const list = map.get(k) ?? [];
        list.push(item);
        map.set(k, list);
      }
    }
    return map;
  }, [feed, cells, visible]);

  const upcomingVisible = upcoming.filter(visible);
  const overdue = upcomingVisible.filter((i) => isOverdue(i, todayKey));
  const soon = upcomingVisible.filter((i) => i.end >= todayKey && i.start <= addDaysKey(todayKey, UPCOMING_DAYS));

  const colorOf = (item: ManagementItem) => categoryColor(categoryById.get(item.categoryId)?.color ?? "gray");

  const nav = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - 1, 1)))}
          aria-label="Previous month"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="min-w-[120px] text-center text-sm font-semibold text-gray-800">{monthLabel(cursor)}</span>
        <button
          type="button"
          onClick={() => setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1)))}
          aria-label="Next month"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div className="relative" ref={filterRef}>
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          aria-label="Filter categories"
          aria-expanded={filterOpen}
          className={`flex h-8 w-8 items-center justify-center rounded border transition-colors ${
            hidden.size > 0 ? "border-pink-300 bg-pink-50 text-pink-600" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 12h10.5M10.5 19.5h3" />
          </svg>
        </button>
        {filterOpen && (
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Categories</p>
              {hidden.size > 0 && (
                <button type="button" onClick={() => toggleCategory(null)} className="text-xs text-pink-600 hover:underline">
                  Show all
                </button>
              )}
            </div>
            <ul className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
              {categories.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-gray-700 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.id)}
                      onChange={() => toggleCategory(c.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                    />
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${categoryColor(c.color).dot}`} />
                    <span className="truncate">{c.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setCategoriesOpen(true)}
        className="h-8 rounded border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300"
      >
        Categories
      </button>
      <Button size="xs" onClick={() => setForm({ kind: "new", date: todayKey })} disabled={!feed}>
        Add event
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Calendar" headerExtra={nav}>
        {(loading || error || hidden.size > 0) && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {hidden.size > 0 && (
              <span>
                {hidden.size} categor{hidden.size === 1 ? "y" : "ies"} hidden.{" "}
                <button type="button" onClick={() => toggleCategory(null)} className="text-pink-600 hover:underline">
                  Show all
                </button>
              </span>
            )}
            {loading && <span className="text-gray-400">Loading…</span>}
            {error && <span className="text-red-600">{error}</span>}
          </div>
        )}

        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 gap-px rounded-lg border border-gray-200 bg-gray-200 text-center text-[10px] font-medium uppercase text-gray-500">
              {WEEKDAY_SHORT.map((d) => (
                <div key={d} className="bg-gray-50 py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px border border-t-0 border-gray-200 bg-gray-200">
              {cells.map((cell) => {
                const k = dayKey(cell);
                const inMonth = cell.getUTCMonth() === cursor.getUTCMonth();
                const isToday = k === todayKey;
                const dayItems = itemsByDay.get(k) ?? [];
                const shown = dayItems.length > MAX_CHIPS_PER_DAY ? dayItems.slice(0, MAX_CHIPS_PER_DAY - 1) : dayItems;
                return (
                  <div key={k} className={`group/day relative min-h-[96px] bg-white p-1.5 text-left ${isToday ? "bg-pink-50/40 ring-1 ring-inset ring-pink-400" : ""}`}>
                    <div className={inMonth ? "" : "opacity-40"}>
                      <div className="flex items-center justify-between">
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${
                            isToday ? "bg-pink-600 text-white" : "text-gray-500"
                          }`}
                        >
                          {cell.getUTCDate()}
                        </div>
                        {feed && (
                          <button
                            type="button"
                            onClick={() => setForm({ kind: "new", date: k })}
                            title="Add an event on this day"
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-base font-bold leading-none text-gray-400 opacity-0 transition-opacity hover:border-pink-400 hover:bg-pink-50 hover:text-pink-500 focus:opacity-100 group-hover/day:opacity-100"
                          >
                            +
                          </button>
                        )}
                      </div>
                      {dayItems.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {shown.map((item) => (
                            <li key={item.key}>
                              <ItemChip item={item} chipClass={colorOf(item).chip} overdue={isOverdue(item, todayKey)} onClick={() => setSelected(item)} />
                            </li>
                          ))}
                          {shown.length < dayItems.length && (
                            <li>
                              <button
                                type="button"
                                onClick={() => setDayList(k)}
                                className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-gray-500 hover:bg-gray-100"
                              >
                                +{dayItems.length - shown.length} more
                              </button>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded bg-gray-200 opacity-60" /> <span className="line-through">Done</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded bg-gray-200 ring-1 ring-red-500" /> Overdue, not marked done
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">↻</span> Repeats
          </span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={`Next ${UPCOMING_DAYS} days`} headerExtra={<InfoTip text="Everything shown on the calendar from today on, plus manual events from the past month that aren't marked done." />}>
        {overdue.length === 0 && soon.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing coming up.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {[...overdue, ...soon].map((item) => {
              const days = daysBetween(todayKey, item.start);
              const when = isOverdue(item, todayKey)
                ? "Overdue"
                : item.start <= todayKey
                  ? item.end > todayKey
                    ? "Now"
                    : "Today"
                  : days === 1
                    ? "Tomorrow"
                    : `In ${days} days`;
              return (
                <li key={`up-${item.key}`}>
                  <button type="button" onClick={() => setSelected(item)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-gray-50">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorOf(item).dot}`} />
                    <span className="w-24 shrink-0 text-xs text-gray-500">{formatItemDates(item.start, item.start)}</span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${item.done ? "text-gray-400 line-through" : "text-gray-800"}`}>
                      {item.title}
                      {item.detail && <span className="ml-2 text-xs text-gray-400">{item.detail}</span>}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        when === "Overdue" ? "bg-red-100 text-red-700" : days <= 7 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {when}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleSection>

      {dayList && (
        <Modal open onClose={() => setDayList(null)} size="md">
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-900">{formatItemDates(dayList, dayList)}</h3>
            <ul className="space-y-1">
              {(itemsByDay.get(dayList) ?? []).map((item) => (
                <li key={item.key}>
                  <ItemChip
                    item={item}
                    chipClass={colorOf(item).chip}
                    overdue={isOverdue(item, todayKey)}
                    onClick={() => {
                      setDayList(null);
                      setSelected(item);
                    }}
                  />
                </li>
              ))}
            </ul>
            <div className="flex justify-end border-t border-gray-100 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setDayList(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {selected && (
        <ItemDialog
          item={selected}
          category={categoryById.get(selected.categoryId)}
          overdue={isOverdue(selected, todayKey)}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setForm({ kind: "edit", item: selected });
            setSelected(null);
          }}
          onChanged={() => {
            setSelected(null);
            void load();
          }}
        />
      )}

      {form && feed && (
        <EventDialog
          form={form}
          categories={categories}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void load();
          }}
        />
      )}

      {categoriesOpen && feed && <CategoriesDialog categories={categories} onClose={() => setCategoriesOpen(false)} onChanged={() => void load()} />}
    </div>
  );
}

function ItemChip({ item, chipClass, overdue, onClick }: { item: ManagementItem; chipClass: string; overdue: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={[item.title, item.detail].filter(Boolean).join("\n")}
      className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${chipClass} ${
        item.done ? "line-through opacity-60" : ""
      } ${overdue ? "ring-1 ring-red-500" : ""}`}
    >
      {item.event && item.event.repeat !== "NONE" && <span className="shrink-0">↻</span>}
      <span className="truncate">{item.title}</span>
    </button>
  );
}

function ItemDialog({
  item,
  category,
  overdue,
  onClose,
  onEdit,
  onChanged,
}: {
  item: ManagementItem;
  category: ManagementCategoryDto | undefined;
  overdue: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const event = item.event;

  async function run(url: string, method: string, body?: unknown) {
    setSaving(true);
    setError("");
    const err = await sendJson(url, method, body);
    setSaving(false);
    if (err) setError(err);
    else onChanged();
  }

  async function remove() {
    if (!event) return;
    const ok = await confirm({
      title: "Delete this event?",
      message: event.repeat === "NONE" ? `"${item.title}" will be removed.` : `"${item.title}" and every time it repeats will be removed.`,
      confirmLabel: "Delete",
    });
    if (ok) await run(`/api/erp/management-calendar/events/${event.id}`, "DELETE");
  }

  const repeatText = event && event.repeat !== "NONE" ? REPEAT_OPTIONS.find((o) => o.value === event.repeat)?.label : null;
  const isExternal = !!item.href && /^https?:\/\//i.test(item.href);

  return (
    <Modal open onClose={onClose} size="md">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-sm ${categoryColor(category?.color ?? "gray").dot}`} />
          <div className="min-w-0">
            <h3 className={`text-base font-semibold text-gray-900 ${item.done ? "line-through" : ""}`}>{item.title}</h3>
            <p className="text-sm text-gray-700">{formatItemDates(item.start, item.end)}</p>
            {item.detail && <p className="text-sm text-gray-600">{item.detail}</p>}
            <p className="mt-1 text-xs text-gray-500">
              {category?.name ?? "No category"}
              {repeatText && `, ${repeatText.toLowerCase()}`}
              {!event && ", added automatically"}
            </p>
            {overdue && <p className="mt-1 text-xs font-medium text-red-600">Overdue, not marked done</p>}
            {item.notes && <p className="mt-2 whitespace-pre-wrap rounded-md bg-gray-50 px-2 py-1.5 text-sm text-gray-700">{item.notes}</p>}
            {!event && <p className="mt-2 text-xs text-gray-500">To change this date, open it and update it there.</p>}
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          {event && (
            <Button
              size="sm"
              disabled={saving}
              onClick={() => run(`/api/erp/management-calendar/events/${event.id}/done`, "POST", { date: item.start, done: !item.done })}
            >
              {item.done ? "Mark not done" : "Mark done"}
            </Button>
          )}
          {event && (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
          {item.href &&
            (isExternal ? (
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Open link
              </a>
            ) : (
              <Link href={item.href} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Open
              </Link>
            ))}
          {event && (
            <Button variant="danger" size="sm" disabled={saving} onClick={remove}>
              Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EventDialog({
  form,
  categories,
  onClose,
  onSaved,
}: {
  form: EventForm;
  categories: ManagementCategoryDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = form.kind === "edit" ? form.item : null;
  const ev = existing?.event;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories.find((c) => !c.builtinKey)?.id ?? "");
  const [startDate, setStartDate] = useState(ev?.startDate ?? (form.kind === "new" ? form.date : ""));
  const [endDate, setEndDate] = useState(ev?.endDate ?? "");
  const [repeat, setRepeat] = useState<RepeatValue>(ev?.repeat ?? "NONE");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [link, setLink] = useState(ev?.link ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) {
      setError("Pick a category");
      return;
    }
    setSaving(true);
    setError("");
    const body = { title, categoryId, startDate, endDate: endDate || null, repeat, notes, link };
    const err = ev
      ? await sendJson(`/api/erp/management-calendar/events/${ev.id}`, "PATCH", body)
      : await sendJson("/api/erp/management-calendar/events", "POST", body);
    setSaving(false);
    if (err) setError(err);
    else onSaved();
  }

  return (
    <Modal open onClose={onClose} size="lg" dismissible={false}>
      <form onSubmit={save} className="space-y-3">
        <h3 className="text-base font-semibold text-gray-900">{ev ? "Edit event" : "New event"}</h3>
        <div>
          <label className={labelClass.default} htmlFor="me-title">Title</label>
          <input id="me-title" className={inputClass.md} value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className={labelClass.default} htmlFor="me-category">Category</label>
          <SearchableSelect
            id="me-category"
            value={categoryId}
            onChange={setCategoryId}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Search categories…"
            allLabel="Pick a category"
            className="mt-1"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass.default} htmlFor="me-start">Date</label>
            <input id="me-start" type="date" className={inputClass.md} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="me-end">
              End date <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input id="me-end" type="date" className={inputClass.md} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <span className={labelClass.default}>Repeats</span>
          <div className="mt-1 flex flex-wrap gap-2 rounded-md bg-gray-50 p-1 text-sm">
            {REPEAT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setRepeat(o.value)}
                aria-pressed={repeat === o.value}
                className={`flex-1 rounded px-3 py-1.5 font-medium ${repeat === o.value ? "bg-white text-pink-600 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {ev && (ev.repeat !== repeat || ev.startDate !== startDate) && ev.repeat !== "NONE" && (
            <p className="mt-1 text-xs text-amber-700">Changing the date or repeat clears the done marks on past repeats.</p>
          )}
        </div>
        <div>
          <label className={labelClass.default} htmlFor="me-notes">Notes</label>
          <textarea id="me-notes" rows={3} className={inputClass.md} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div>
          <label className={labelClass.default} htmlFor="me-link">
            Link <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input id="me-link" className={inputClass.md} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CategoriesDialog({ categories, onClose, onChanged }: { categories: ManagementCategoryDto[]; onClose: () => void; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <Modal open onClose={onClose} size="lg">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900">Categories</h3>
          <InfoTip text="Reminders: days before an item to include it in the morning email to Admins and PMs, like 30, 7. Leave blank for no reminders." />
        </div>
        <ul className="divide-y divide-gray-100">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} onChanged={onChanged} />
          ))}
          {adding && <CategoryRow onChanged={onChanged} onDone={() => setAdding(false)} />}
        </ul>
        <div className="flex justify-between border-t border-gray-100 pt-3">
          {!adding ? (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              Add category
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** One editable category, or a new one when `category` is missing. */
function CategoryRow({ category, onChanged, onDone }: { category?: ManagementCategoryDto; onChanged: () => void; onDone?: () => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? "gray");
  const [remind, setRemind] = useState(category ? formatRemindDays(category.remindDays) : "7");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = !category || name !== category.name || color !== category.color || remind !== formatRemindDays(category.remindDays);

  async function save() {
    setSaving(true);
    setError("");
    const body = { name, color, remindDays: remind };
    const err = category
      ? await sendJson(`/api/erp/management-calendar/categories/${category.id}`, "PATCH", body)
      : await sendJson("/api/erp/management-calendar/categories", "POST", body);
    setSaving(false);
    if (err) return setError(err);
    onChanged();
    onDone?.();
  }

  async function remove() {
    if (!category) return;
    const ok = await confirm({ title: "Delete this category?", message: `"${category.name}" will be removed.`, confirmLabel: "Delete" });
    if (!ok) return;
    setSaving(true);
    const err = await sendJson(`/api/erp/management-calendar/categories/${category.id}`, "DELETE");
    setSaving(false);
    if (err) setError(err);
    else onChanged();
  }

  return (
    <li className="space-y-1.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass.sm} min-w-[10rem] flex-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          aria-label="Category name"
          autoFocus={!category}
        />
        <label className="flex items-center gap-1 text-xs text-gray-500">
          Remind
          <input className={`${inputClass.sm} w-20`} value={remind} onChange={(e) => setRemind(e.target.value)} placeholder="30, 7" aria-label="Reminder days" />
          days before
        </label>
        {dirty && (
          <Button size="xs" disabled={saving || !name.trim()} onClick={save}>
            {category ? "Save" : "Add"}
          </Button>
        )}
        {!category && (
          <Button variant="ghost" size="xs" onClick={onDone}>
            Cancel
          </Button>
        )}
        {category && !category.builtinKey && (
          <Button variant="ghost" size="xs" disabled={saving} onClick={remove} title={category.eventCount ? "Move or delete its events first" : undefined}>
            Delete
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {Object.entries(CATEGORY_COLORS).map(([key, c]) => (
          <button
            key={key}
            type="button"
            onClick={() => setColor(key)}
            aria-label={key}
            aria-pressed={color === key}
            className={`h-4 w-4 rounded-full ${c.dot} ${color === key ? "ring-2 ring-gray-700 ring-offset-1" : ""}`}
          />
        ))}
        <span className="ml-2 text-[11px] text-gray-400">
          {category?.builtinKey
            ? `Automatic: ${BUILTIN_SOURCE[category.builtinKey as BuiltinKey] ?? "filled in from the ERP"}`
            : category
              ? `${category.eventCount} event${category.eventCount === 1 ? "" : "s"}`
              : ""}
        </span>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </li>
  );
}
