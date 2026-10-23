"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm, useToast } from "@/app/erp/components/ui";
import type { BoardCard, BoardColumn, PipelineBoard } from "@/lib/erp/pipelineBoard";
import type { NextStep } from "@/lib/erp/dealFollowUps";
import type { LostSaved } from "../LostReasonModal";
import type { InfoSaved } from "../DealInfoModal";
import { missingFrom, type MissingField } from "@/lib/erp/pipelineMissing";

/** What the stage rules look at, from a card. */
export function factsOf(c: BoardCard, activeOwners: { id: string }[]) {
  return {
    ownerOk: !!c.ownerId && activeOwners.some((o) => o.id === c.ownerId),
    hasCompany: !!c.gc,
    bidDate: c.bidDate,
    walkDate: c.walkDate,
    awardDate: c.awardDate,
    cents: c.cents,
    sqft: c.sqft,
  };
}

export type Undo = { id: string; name: string; from: string; to: string; toLabel: string };

/**
 * Changes made on this page (lost reasons, next steps, info edits, re-bids,
 * stage moves), shown on the cards right away. After a reload the server
 * applies them itself (dealEdits.ts), so these only bridge until then.
 * Also the stage move rules and Undo.
 */
export function useBoardEdits(
  board: PipelineBoard,
  onNeedLostReason: (card: BoardCard) => void,
  /** A forward move into a stage whose rules ask for info the deal doesn't have */
  onNeedInfo: (card: BoardCard, col: BoardColumn, missing: MissingField[]) => void,
) {
  const toast = useToast();
  const confirm = useConfirm();
  const [lost, setLost] = useState<Map<string, LostSaved>>(new Map());
  const [next, setNext] = useState<Map<string, NextStep | null>>(new Map());
  const [info, setInfo] = useState<Map<string, InfoSaved>>(new Map());
  const [rebids, setRebids] = useState<Map<string, { newDealId: string; url: string | null }>>(new Map());
  const [stages, setStages] = useState<Map<string, string>>(new Map());
  const [undo, setUndo] = useState<Undo | null>(null);

  const cards = useMemo(() => {
    if (!lost.size && !next.size && !info.size && !rebids.size && !stages.size) return board.cards;
    return board.cards.map((orig) => {
      let c: BoardCard = orig;
      const i = info.get(c.id);
      if (i) {
        // Fixed fields drop off Missing; the server works it out again on the next load.
        const merged = { ...c, ...i };
        c = { ...merged, missing: missingFrom(c.missing, factsOf(merged, board.activeOwners)) };
      }
      // A stage move starts the clock over: no Stuck, Clean up or Quiet until the next refresh says otherwise.
      const st = stages.get(c.id);
      if (st && st !== c.stageId) c = { ...c, stageId: st, daysInStage: 0, stuck: false, cleanup: false, stale: false };
      if (next.has(c.id)) c = { ...c, nextStep: next.get(c.id) ?? null };
      const rb = rebids.get(c.id);
      if (rb) c = { ...c, rebid: rb };
      const l = lost.get(c.id);
      if (l) {
        const moved = l.stageId !== c.stageId;
        c = {
          ...c,
          stageId: l.stageId,
          lostReasons: l.reasons,
          gcNotAwarded: board.pipeline === "post-con" && l.reasons.includes("GC Not Awarded"),
          winner: l.winner,
          ...(moved ? { stuck: false, cleanup: false, stale: false, priceFlag: null } : {}),
        };
      }
      return c;
    });
  }, [board.cards, board.activeOwners, board.pipeline, lost, next, info, rebids, stages]);

  const set =
    <T>(setter: (fn: (m: Map<string, T>) => Map<string, T>) => void) =>
    (id: string, v: T) =>
      setter((m) => new Map(m).set(id, v));

  /** Open: any other stage. Won: only a later won stage. Lost: nowhere. Matches dealStageMove.ts. */
  function canMove(card: BoardCard, col: BoardColumn): boolean {
    const from = board.columns.findIndex((c) => c.stageId === card.stageId);
    const fromCol = board.columns[from];
    if (!fromCol || col.stageId === card.stageId || fromCol.outcome === "lost") return false;
    if (fromCol.outcome === "won") return col.outcome === "won" && board.columns.indexOf(col) > from;
    return true;
  }

  /**
   * Moves the card on screen first, then saves to HubSpot (a move makes a few
   * HubSpot calls, so waiting for it looked like nothing happened). If HubSpot
   * refuses, the card goes back and the reason shows.
   */
  async function sendMove(card: { id: string }, from: string, to: string, confirmWon: boolean): Promise<boolean> {
    const before = stages.get(card.id);
    setStages((m) => new Map(m).set(card.id, to));
    const revert = () =>
      setStages((m) => {
        const n = new Map(m);
        if (before === undefined) n.delete(card.id);
        else n.set(card.id, before);
        return n;
      });
    try {
      const res = await fetch(`/api/erp/pipeline/deals/${card.id}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline: board.pipeline, fromStageId: from, toStageId: to, confirmWon }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; nextStep?: NextStep | null } | null;
      if (!res.ok || !data || data.error) {
        revert();
        toast(data?.error ?? "Couldn't move it. Try again.", "error");
        return false;
      }
      // The stage's automatic next step, added by the move.
      if (data.nextStep) setNext((m) => new Map(m).set(card.id, data.nextStep!));
      return true;
    } catch {
      revert();
      toast("Couldn't reach the server, so the card went back. Try again.", "error");
      return false;
    }
  }

  /**
   * Drag or Move to: lost asks for the reason, won asks to confirm, open moves
   * at once with Undo. Forward into an open stage first checks its rules and
   * asks for anything missing (the server checks again).
   */
  async function moveCard(card: BoardCard, col: BoardColumn) {
    if (!canMove(card, col)) return;
    const forward = board.columns.indexOf(col) > board.columns.findIndex((c) => c.stageId === card.stageId);
    if (col.outcome === "open" && forward) {
      const missing = missingFrom(col.required, factsOf(card, board.activeOwners));
      if (missing.length) return onNeedInfo(card, col, missing);
    }
    const fromWon = board.columns.some((c) => c.stageId === card.stageId && c.outcome === "won");
    if (fromWon) {
      const effect = /billing/i.test(col.label)
        ? ": it's marked billed"
        : /complete/i.test(col.label)
          ? ": it's marked Complete, and if it was billed, paid"
          : "";
      const ok = await confirm({
        title: `Move to ${col.label}?`,
        message: `Moves "${card.name}" to ${col.label} in HubSpot. On the next HubSpot sync the ERP project follows${effect}. There's no undo, and won deals can't be moved back from the board.`,
        confirmLabel: "Move",
        danger: false,
      });
      if (ok && (await sendMove(card, card.stageId, col.stageId, true))) toast(`Moved to ${col.label}.`, "success");
      return;
    }
    if (col.outcome === "lost") return onNeedLostReason(card);
    if (col.outcome === "won") {
      const ok = await confirm({
        title: `Move to ${col.label}?`,
        message: `This marks "${card.name}" as won in HubSpot. The next HubSpot sync creates an ERP project for it. Moving it back later won't remove that project.`,
        confirmLabel: "Move",
        danger: false,
      });
      if (ok && (await sendMove(card, card.stageId, col.stageId, true)))
        toast(`Moved to ${col.label}. The ERP project is made on the next HubSpot sync.`, "success");
      return;
    }
    // Undo shows right away with the move; it goes if the save fails.
    const move = { id: card.id, name: card.name, from: card.stageId, to: col.stageId, toLabel: col.label };
    setUndo(move);
    if (!(await sendMove(card, card.stageId, col.stageId, false))) setUndo((u) => (u === move ? null : u));
  }

  // Undo is offered for 10 seconds.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 10_000);
    return () => clearTimeout(t);
  }, [undo]);

  async function undoMove() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    if (await sendMove({ id: u.id }, u.to, u.from, false)) toast("Move undone.", "success");
  }

  return {
    cards,
    saveLost: set<LostSaved>(setLost),
    saveNext: set<NextStep | null>(setNext),
    saveInfo: set<InfoSaved>(setInfo),
    saveRebid: set<{ newDealId: string; url: string | null }>(setRebids),
    canMove,
    moveCard,
    undo,
    undoMove,
  };
}
