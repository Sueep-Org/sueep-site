"use client";

import { createContext, useContext } from "react";
import type { BoardCard, BoardColumn } from "@/lib/erp/pipelineBoard";
import type { Attention } from "@/lib/erp/dealAttention";
import type { MissingField } from "@/lib/erp/pipelineMissing";
import type { CardField } from "@/lib/erp/boardCardFields";

/** What cards and columns need from the board, without passing it through every level. */
export type BoardContext = {
  today: string;
  /** The viewer's picked card details (BoardPreference) */
  cardFields: CardField[];
  /** "GC" on post-construction, "Company" on janitorial */
  companyWord: string;
  labelOf: (reason: string) => string;
  missingLabel: (f: MissingField) => string;
  attentionOf: (card: BoardCard) => Attention[];
  openPanel: (card: BoardCard) => void;
  editLost: (card: BoardCard, markLost: boolean) => void;
  editNext: (card: BoardCard) => void;
  editInfo: (card: BoardCard) => void;
  rebid: (card: BoardCard) => void;
  moveTo: (card: BoardCard) => void;
  setPriority: (card: BoardCard) => void;
  clone: (card: BoardCard) => void;
  following: (card: BoardCard) => boolean;
  toggleFollow: (card: BoardCard) => void;
  /** Dragging: the card in the air, whether it may land on a column, and dropping it */
  dragging: BoardCard | null;
  dragStart: (card: BoardCard) => void;
  dragEnd: () => void;
  canMove: (card: BoardCard, col: BoardColumn) => boolean;
  drop: (col: BoardColumn) => void;
};

export const BoardCtx = createContext<BoardContext | null>(null);

export function useBoard(): BoardContext {
  const ctx = useContext(BoardCtx);
  if (!ctx) throw new Error("useBoard must be used inside the pipeline board");
  return ctx;
}
