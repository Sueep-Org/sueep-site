"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, useToast } from "@/app/erp/components/ui";
import { centsToDollarsCompact } from "@/lib/erp/money";
import type { BoardCard, BoardColumn, PipelineBoard } from "@/lib/erp/pipelineBoard";
import { MISSING_FIELDS, MISSING_LABELS, type MissingField } from "@/lib/erp/pipelineMissing";
import { dealAttention } from "@/lib/erp/dealAttention";
import { BAND_COLOR, todayKey } from "@/lib/erp/pipelineUi";
import { DealInfoModal } from "./DealInfoModal";
import { DealPanel } from "./DealPanel";
import { JobWalkModal } from "./JobWalkModal";
import { RebidModal } from "./RebidModal";
import { NewDealModal } from "./NewDealModal";
import { MoveToModal } from "./MoveToModal";
import { LostReasonModal, type Option } from "./LostReasonModal";
import { NextStepModal } from "./NextStepModal";
import { PriorityModal } from "./PriorityModal";
import { BoardCtx, type BoardContext } from "./board/context";
import { BoardColumn as Column } from "./board/BoardColumn";
import { WeeklyStrip } from "./board/WeeklyStrip";
import { QuickViews } from "./board/QuickViews";
import { FilterMenu } from "./board/FilterMenu";
import { useBoardEdits } from "./board/useBoardEdits";
import { ME, NO_OWNER, applyFilters, normalizeFilters, sameFilters, viewPreset, type Filters, type ViewKey } from "./board/filters";
import { CardFieldsMenu } from "./board/CardFieldsMenu";
import { BoardTable } from "./board/BoardTable";
import { BulkBar } from "./board/BulkBar";
import { exportDeals } from "./board/exportDeals";
import { DownloadCsvButton } from "@/app/erp/components/DownloadCsvButton";
import { cardFlag } from "@/lib/erp/dealAttention";
import { SavedViews, type SavedView } from "./board/SavedViews";
import type { CardField } from "@/lib/erp/boardCardFields";

const TOP_OPEN_KEY = "deals-top-open";

/**
 * The pipeline board: This week row, quick views, search and filter menu,
 * the stage columns, and the deal panel and editors. The pieces live in
 * ./board; this wires them together. Older won and lost deals are loaded by
 * the server (?closed=all); every other filter narrows the cards loaded.
 */
export function PipelineBoardView({
  board,
  closedDays,
  scopes,
  startOnMine,
  reasonOptions,
  companies,
  mayEditCompanies,
  typeOptions,
  cardFields: startCardFields,
  savedViews,
  mayManagePipeline,
  followed: startFollowed,
  openDealId,
}: {
  board: PipelineBoard;
  closedDays: number;
  scopes: Option[];
  /** Open on the viewer's own deals (Sales and Estimation), when they own any here */
  startOnMine: boolean;
  /** HubSpot Deal Lost Reason options */
  reasonOptions: Option[];
  /** Companies, for who won a GC Not Awarded job */
  companies: Option[];
  /** Admin and Business Manager: can add a typed company name to a company's other names */
  mayEditCompanies: boolean;
  /** HubSpot Type of business options, for New deal */
  typeOptions: Option[];
  /** The viewer's card details for this pipeline */
  cardFields: CardField[];
  /** The viewer's own views and shared ones */
  savedViews: SavedView[];
  /** Admin and Business Manager: share views (and later stage rules and bulk edits) */
  mayManagePipeline: boolean;
  /** Deal ids the viewer follows */
  followed: string[];
  /** Open this deal's panel on load (?deal=, from follow emails) */
  openDealId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const isJan = board.pipeline === "janitorial";
  // Janitorial deals are for property managers and owners, not GCs.
  const companyWord = isJan ? "Company" : "GC";
  const today = todayKey();
  const columnOf = useMemo(() => new Map(board.columns.map((c) => [c.stageId, c])), [board.columns]);
  const lostLabel = board.columns.find((c) => c.outcome === "lost")?.label ?? "lost";

  // Editors and the side panel.
  const [editingLost, setEditingLost] = useState<{ card: BoardCard; markLost: boolean } | null>(null);
  const [editingNext, setEditingNext] = useState<BoardCard | null>(null);
  const [bookingWalk, setBookingWalk] = useState<BoardCard | null>(null);
  const [editingInfo, setEditingInfo] = useState<BoardCard | null>(null);
  const [editingRebid, setEditingRebid] = useState<BoardCard | null>(null);
  const [movingTo, setMovingTo] = useState<BoardCard | null>(null);
  const [settingPriority, setSettingPriority] = useState<BoardCard | null>(null);
  const [cloning, setCloning] = useState<BoardCard | null>(null);
  const [layout, setLayout] = useState<"board" | "table">("board");
  // "This week and views" starts folded; each person's choice is kept in their browser.
  const [topOpen, setTopOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(TOP_OPEN_KEY) === "1") setTopOpen(true);
    } catch {}
  }, []);
  function toggleTop(open: boolean) {
    setTopOpen(open);
    try {
      localStorage.setItem(TOP_OPEN_KEY, open ? "1" : "0");
    } catch {}
  }
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [panelId, setPanelId] = useState<string | null>(null);
  // Open the linked deal's panel (?deal=) once in the browser: the panel draws into document.body, which the server doesn't have.
  useEffect(() => {
    if (openDealId && board.cards.some((c) => c.id === openDealId)) setPanelId(openDealId);
    // Only on first load; later clicks open panels themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [following, setFollowing] = useState<Set<string>>(() => new Set(startFollowed));
  const [dragging, setDragging] = useState<BoardCard | null>(null);
  const [cardFields, setCardFields] = useState<CardField[]>(startCardFields);

  const [pendingMove, setPendingMove] = useState<{ card: BoardCard; col: BoardColumn; missing: MissingField[] } | null>(null);
  const edits = useBoardEdits(
    board,
    (card) => setEditingLost({ card, markLost: true }),
    (card, col, missing) => setPendingMove({ card, col, missing }),
  );
  const cards = edits.cards;

  // What needs attention on each card: one list for the card flag, the panel and the views.
  const attentionOf = useCallback(
    (c: BoardCard) => {
      const col = columnOf.get(c.stageId);
      return dealAttention(c, {
        outcome: col?.outcome ?? "open",
        stageLabel: col?.label ?? "this stage",
        expectsNextStep: !!col?.expectsNextStep,
        today,
        companyWord,
      });
    },
    [columnOf, today, companyWord],
  );
  const attentionKeys = useMemo(() => new Map(cards.map((c) => [c.id, attentionOf(c).map((a) => a.key)])), [cards, attentionOf]);

  // Filters and quick views.
  const hasMine = !!board.viewerOwnerId && cards.some((c) => c.ownerId === board.viewerOwnerId);
  const startView: ViewKey = startOnMine && hasMine ? "mine" : "everything";
  const startFilters = viewPreset(startView, hasMine).filters;
  const [filters, setFilters] = useState<Filters>(startFilters);
  const [search, setSearch] = useState("");
  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const recentOnly = board.closed === "recent";

  function setClosed(next: "recent" | "all") {
    if (next === board.closed) return;
    const q = new URLSearchParams();
    if (isJan) q.set("pipeline", "janitorial");
    if (next === "all") q.set("closed", "all");
    router.push(q.size ? `/erp/pipeline?${q}` : "/erp/pipeline");
  }

  const views = useMemo(() => {
    const list: { key: ViewKey; label: string }[] = [{ key: "everything", label: "Everything" }];
    if (hasMine) list.push({ key: "mine", label: "My deals" });
    list.push({ key: "todos", label: hasMine ? "My to-dos" : "To-dos" }, { key: "cleanup", label: "Clean up" }, { key: "lost", label: "Lost follow-up" });
    if (!isJan) list.push({ key: "bids", label: "Bids this week" }, { key: "awardThis", label: "Awarding this month" }, { key: "awardNext", label: "Awarding next month" });
    if (following.size) list.push({ key: "following", label: "Following" });
    return list;
  }, [hasMine, isJan, following.size]);
  // A view is lit only when both its filters and its older-deals setting match.
  const activeView =
    views.find((v) => {
      const p = viewPreset(v.key, hasMine);
      return sameFilters(p.filters, filters) && (p.closed ?? "recent") === board.closed;
    })?.key ?? null;
  function pickView(v: ViewKey) {
    const p = viewPreset(v, hasMine);
    setFilters(p.filters);
    setClosed(p.closed ?? "recent");
  }
  const filtersActive = !sameFilters(filters, startFilters) || !recentOnly;
  // A quick view wins the highlight when a saved view has the same filters.
  const activeSaved = activeView
    ? null
    : (savedViews.find((v) => sameFilters(normalizeFilters(v.filters), filters) && v.closed === board.closed)?.id ?? null);
  function pickSaved(v: SavedView) {
    setFilters(normalizeFilters(v.filters));
    setClosed(v.closed);
  }

  const ownerOptions = useMemo(() => {
    const names = [...new Set(cards.map((c) => c.owner).filter((o): o is string => !!o))].sort().map((o) => ({ value: o, label: o }));
    const me = board.viewerOwnerId ? cards.find((c) => c.ownerId === board.viewerOwnerId)?.owner : null;
    return [...(me ? [{ value: ME, label: `Me (${me})` }] : []), { value: NO_OWNER, label: "No owner" }, ...names];
  }, [cards, board.viewerOwnerId]);
  const gcOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) if (c.gc) m.set(c.gc.key, c.gc.label);
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [cards]);

  const shown = useMemo(
    () => applyFilters(cards, filters, { today, search, viewerOwnerId: board.viewerOwnerId, columnOf, attentionOf: attentionKeys, following }),
    [cards, filters, today, search, board.viewerOwnerId, columnOf, attentionKeys, following],
  );
  const byStage = useMemo(() => {
    const m = new Map<string, BoardCard[]>();
    for (const c of shown) m.set(c.stageId, [...(m.get(c.stageId) ?? []), c]);
    return m;
  }, [shown]);
  // Counts per missing field over the cards the other filters leave.
  const missingCounts = useMemo(() => {
    const m = new Map<MissingField, number>();
    for (const c of shown) for (const f of c.missing) m.set(f, (m.get(f) ?? 0) + 1);
    return m;
  }, [shown]);

  // The card actions call the latest move code through these (the context value is memoized).
  const moveRef = useRef(edits.moveCard);
  moveRef.current = edits.moveCard;
  const canMoveRef = useRef(edits.canMove);
  canMoveRef.current = edits.canMove;
  const labels = useMemo(() => new Map(reasonOptions.map((o) => [o.value, o.label])), [reasonOptions]);
  const ctx = useMemo<BoardContext>(
    () => ({
      today,
      cardFields,
      companyWord,
      labelOf: (r) => labels.get(r) ?? r,
      missingLabel: (f) => (f === "company" ? companyWord : MISSING_LABELS[f]),
      attentionOf,
      openPanel: (card) => setPanelId(card.id),
      editLost: (card, markLost) => setEditingLost({ card, markLost }),
      editNext: setEditingNext,
      editInfo: setEditingInfo,
      rebid: setEditingRebid,
      moveTo: setMovingTo,
      setPriority: setSettingPriority,
      clone: setCloning,
      following: (card) => following.has(card.id),
      toggleFollow: (card) => void toggleFollow(card),
      dragging,
      dragStart: setDragging,
      dragEnd: () => setDragging(null),
      canMove: (card, col) => canMoveRef.current(card, col),
      drop: (col: BoardColumn) => {
        if (dragging) void moveRef.current(dragging, col);
        setDragging(null);
      },
    }),
    // toggleFollow reads the latest `following` through the state setter, so `following` covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, cardFields, companyWord, labels, attentionOf, dragging, following],
  );

  /** Follow or stop following; on screen at once, back if the server refuses. */
  async function toggleFollow(card: BoardCard) {
    const follow = !following.has(card.id);
    const flip = (on: boolean) =>
      setFollowing((prev) => {
        const next = new Set(prev);
        if (on) next.add(card.id);
        else next.delete(card.id);
        return next;
      });
    flip(follow);
    const res = await fetch(`/api/erp/pipeline/deals/${card.id}/follow`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline: board.pipeline, follow }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok || data?.error) {
      flip(!follow);
      return toast(data?.error ?? "Couldn't save. Try again.", "error");
    }
    toast(follow ? `Following ${card.name}. You'll hear when it changes.` : `Stopped following ${card.name}.`);
  }

  const panelCard = panelId ? (cards.find((c) => c.id === panelId) ?? null) : null;
  // Ticked rows that are still shown, so a filter change never bulk edits deals you can't see.
  const selectedCards = shown.filter((c) => selected.has(c.id));
  const closePanel = useCallback(() => setPanelId(null), []);
  const owners = board.activeOwners.map((o) => ({ value: o.id, label: o.name }));

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => toggleTop(!topOpen)}
          aria-expanded={topOpen}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-50"
        >
          <span aria-hidden className={`text-gray-400 transition-transform ${topOpen ? "rotate-90" : ""}`}>▸</span>
          <span className="font-semibold text-gray-800">This week and views</span>
          {!topOpen && (
            <span className="truncate text-gray-500">
              · Showing: {views.find((v) => v.key === activeView)?.label ?? savedViews.find((v) => v.id === activeSaved)?.name ?? "Custom filters"}
            </span>
          )}
        </button>
        {topOpen && (
          <div className="space-y-3 border-t border-gray-100 px-3 py-3">
            <WeeklyStrip board={board} />
            <QuickViews views={views} active={activeView} onPick={pickView}>
              <SavedViews
                pipeline={board.pipeline}
                views={savedViews}
                active={activeSaved}
                onPick={pickSaved}
                canSave={!activeView && !activeSaved && filtersActive}
                filters={filters}
                closed={board.closed}
                mayShare={mayManagePipeline}
              />
            </QuickViews>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search deal or ${companyWord}…`}
            aria-label="Search deals"
            className="h-8 w-56 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
          <span className="text-xs text-gray-500">
            {shown.length} deals · {centsToDollarsCompact(shown.reduce((s, c) => s + c.cents, 0))}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-3 text-[11px] text-gray-500 sm:flex">
            {!isJan &&
              (["Strong", "Fair"] as const).map((band) => (
                <span key={band} className="flex items-center gap-1">
                  <span className="h-3 w-1 rounded-sm" style={{ background: BAND_COLOR[band] }} />
                  {band} chance
                </span>
              ))}
            <InfoTip
              align="right"
              text={`Each card: deal name (opens HubSpot), ${companyWord}, amount and the owner's initials (change these under Cards), plus the one thing that needs attention most. A next step shows when it's due this week or late.${
                isJan ? "" : " The stripe on the left is the chance to win: green Strong, gray Fair, none for Long shot."
              } Hover a card for everything else, or click it for the deal panel.`}
            />
          </div>
          <div className="inline-flex h-8 overflow-hidden rounded-md border border-gray-300" role="group" aria-label="Layout">
            {(["board", "table"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLayout(l)}
                aria-pressed={layout === l}
                className={`px-2.5 text-xs font-medium ${layout === l ? "bg-gray-200 text-gray-900" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {l === "board" ? "Board" : "Table"}
              </button>
            ))}
          </div>
          <DownloadCsvButton
            title="Download the deals shown, after filters, as a spreadsheet"
            disabled={!shown.length}
            onClick={() => exportDeals(shown, board.columns, board.pipeline, (c) => cardFlag(attentionOf(c))?.text ?? "")}
          />
          {layout === "board" && <CardFieldsMenu pipeline={board.pipeline} fields={cardFields} onChange={setCardFields} />}
          <FilterMenu
            filters={filters}
            update={update}
            active={filtersActive}
            onReset={() => {
              setFilters(startFilters);
              setClosed("recent");
            }}
            ownerOptions={ownerOptions}
            gcOptions={gcOptions}
            scopes={scopes}
            isJan={isJan}
            companyWord={companyWord}
            closed={board.closed}
            onClosed={setClosed}
            closedDays={closedDays}
          />
          <Button size="sm" onClick={() => setCreating(true)}>
            New deal
          </Button>
        </div>
      </div>

      {filters.flags.includes("missing") && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="flex items-center gap-1 text-gray-500">
            Missing
            <InfoTip text="Open deals missing what their stage needs, set on the Stage rules page (by default an active owner and a GC always; a Bid Date from Bidding on; an amount, and on post-construction Area SQFT, in the quote stages). Click one to see only those." />
          </span>
          {MISSING_FIELDS.map((f) => {
            const n = missingCounts.get(f) ?? 0;
            if (!n) return null;
            const on = filters.missingField === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => update({ missingField: on ? "" : f })}
                className={`rounded-full border px-2 py-0.5 ${on ? "border-sky-300 bg-sky-50 text-sky-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
              >
                {ctx.missingLabel(f)} {n}
              </button>
            );
          })}
        </div>
      )}

      <BoardCtx.Provider value={ctx}>
        {layout === "table" ? (
          <div className="space-y-2">
            {mayManagePipeline && selectedCards.length > 0 && (
              <BulkBar
                pipeline={board.pipeline}
                cards={selectedCards}
                columns={board.columns}
                owners={owners}
                reasons={reasonOptions}
                onClear={() => setSelected(new Set())}
              />
            )}
            <BoardTable
              rows={shown}
              columns={board.columns}
              selectable={mayManagePipeline}
              selected={selected}
              onSelect={(ids, on) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const id of ids) {
                    if (on) next.add(id);
                    else next.delete(id);
                  }
                  return next;
                })
              }
            />
          </div>
        ) : (
          <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
            {board.columns.map((col) => (
              <Column key={col.stageId} col={col} cards={byStage.get(col.stageId) ?? []} closedDays={closedDays} recentOnly={recentOnly} />
            ))}
          </div>
        )}
      </BoardCtx.Provider>

      {edits.undo && (
        <div className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          <span className="max-w-[60vw] truncate">
            Moved {edits.undo.name} to {edits.undo.toLabel}
          </span>
          <button type="button" onClick={() => void edits.undoMove()} className="font-semibold text-pink-300 hover:text-pink-200">
            Undo
          </button>
        </div>
      )}

      {panelCard && (
        <DealPanel
          card={panelCard}
          column={columnOf.get(panelCard.stageId)}
          pipeline={board.pipeline}
          attention={attentionOf(panelCard)}
          labelOf={ctx.labelOf}
          winBacktest={board.winBacktest}
          winBase={board.winBase}
          priceRanges={board.priceRanges}
          onClose={closePanel}
          onNextStep={() => setEditingNext(panelCard)}
          onEditInfo={() => setEditingInfo(panelCard)}
          onBookWalk={() => setBookingWalk(panelCard)}
          onMoveTo={() => setMovingTo(panelCard)}
          onPriority={() => setSettingPriority(panelCard)}
          onClone={() => setCloning(panelCard)}
          following={following.has(panelCard.id)}
          onToggleFollow={() => void toggleFollow(panelCard)}
          onLost={() => setEditingLost({ card: panelCard, markLost: columnOf.get(panelCard.stageId)?.outcome !== "lost" })}
          onRebid={panelCard.gcNotAwarded && panelCard.winner && !panelCard.rebid ? () => setEditingRebid(panelCard) : undefined}
        />
      )}
      {movingTo && (
        <MoveToModal
          card={movingTo}
          columns={board.columns.filter((c) => edits.canMove(movingTo, c))}
          onClose={() => setMovingTo(null)}
          onPick={(col) => {
            const card = movingTo;
            setMovingTo(null);
            void edits.moveCard(card, col);
          }}
        />
      )}
      {settingPriority && (
        <PriorityModal
          card={settingPriority}
          pipeline={board.pipeline}
          onClose={() => setSettingPriority(null)}
          onSaved={(priority) => {
            const c = settingPriority;
            setSettingPriority(null);
            edits.saveInfo(c.id, { ownerId: c.ownerId, owner: c.owner, companyText: c.companyText, gc: c.gc, bidDate: c.bidDate, walkDate: c.walkDate, cents: c.cents, sqft: c.sqft, priority });
            toast(priority ? `Priority set to ${priority}.` : "Priority cleared.");
          }}
        />
      )}
      {creating && (
        <NewDealModal
          pipeline={board.pipeline}
          columns={board.columns.filter((c) => c.outcome === "open")}
          cards={cards}
          owners={owners}
          companies={companies}
          typeOptions={typeOptions}
          defaultOwnerId={board.viewerOwnerId ?? ""}
          onClose={() => setCreating(false)}
          onSaved={(deal) => {
            setCreating(false);
            toast(`Created in HubSpot: ${deal.name}`, "success");
            // The server adds it to the board from the ERP's copy; the panel opens once it's there.
            setPanelId(deal.newDealId);
            router.refresh();
          }}
        />
      )}
      {cloning && (
        <NewDealModal
          pipeline={board.pipeline}
          columns={board.columns.filter((c) => c.outcome === "open")}
          cards={cards}
          owners={owners}
          companies={companies}
          typeOptions={typeOptions}
          defaultOwnerId={board.viewerOwnerId ?? ""}
          copyFrom={cloning}
          onClose={() => setCloning(null)}
          onSaved={(deal) => {
            setCloning(null);
            toast(`Clone created in HubSpot: ${deal.name}`, "success");
            setPanelId(deal.newDealId);
            router.refresh();
          }}
        />
      )}
      {editingRebid && (
        <RebidModal
          card={editingRebid}
          owners={owners}
          defaultOwnerId={board.activeOwners.some((o) => o.id === editingRebid.ownerId) ? (editingRebid.ownerId ?? "") : (board.viewerOwnerId ?? "")}
          onClose={() => setEditingRebid(null)}
          onSaved={(r) => {
            edits.saveRebid(editingRebid.id, r);
            setEditingRebid(null);
            toast("Re-bid deal created in HubSpot. It shows in Lead after the next refresh.", "success");
          }}
        />
      )}
      {editingInfo && (
        <DealInfoModal
          card={editingInfo}
          pipeline={board.pipeline}
          owners={owners}
          companies={companies}
          mayEditCompanies={mayEditCompanies}
          onClose={() => setEditingInfo(null)}
          onSaved={(info) => {
            edits.saveInfo(editingInfo.id, info);
            setEditingInfo(null);
            toast("Saved in HubSpot.", "success");
          }}
        />
      )}
      {pendingMove && (
        <DealInfoModal
          card={pendingMove.card}
          pipeline={board.pipeline}
          owners={owners}
          companies={companies}
          mayEditCompanies={mayEditCompanies}
          moveTo={{ label: pendingMove.col.label, missing: pendingMove.missing }}
          onClose={() => setPendingMove(null)}
          onSaved={(info) => {
            const { card, col } = pendingMove;
            setPendingMove(null);
            edits.saveInfo(card.id, info);
            void edits.moveCard({ ...card, ...info, missing: [] }, col);
          }}
        />
      )}
      {bookingWalk && (
        <JobWalkModal
          card={bookingWalk}
          pipeline={board.pipeline}
          today={today}
          onClose={() => setBookingWalk(null)}
          onSaved={(day) => {
            const c = bookingWalk;
            edits.saveInfo(c.id, { ownerId: c.ownerId, owner: c.owner, companyText: c.companyText, gc: c.gc, bidDate: c.bidDate, walkDate: day, cents: c.cents, sqft: c.sqft, priority: c.priority });
            setBookingWalk(null);
            toast("Job walk booked in HubSpot.", "success");
          }}
        />
      )}
      {editingNext && (
        <NextStepModal
          card={editingNext}
          pipeline={board.pipeline}
          today={today}
          onClose={() => setEditingNext(null)}
          onSaved={(next) => {
            edits.saveNext(editingNext.id, next);
            setEditingNext(null);
            toast(next ? "Next step saved." : "Next step done.", "success");
          }}
        />
      )}
      {editingLost && (
        <LostReasonModal
          card={editingLost.card}
          pipeline={board.pipeline}
          markLost={editingLost.markLost}
          lostStageLabel={lostLabel}
          reasonOptions={reasonOptions}
          companies={companies}
          onClose={() => setEditingLost(null)}
          onSaved={(result) => {
            const { card, markLost } = editingLost;
            edits.saveLost(card.id, result);
            setEditingLost(null);
            toast(markLost ? `Marked lost in HubSpot: ${card.name}` : "Lost reason saved in HubSpot.", "success");
          }}
        />
      )}
    </div>
  );
}
