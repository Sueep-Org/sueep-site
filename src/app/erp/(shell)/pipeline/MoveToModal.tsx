"use client";

import { Button, InfoTip, Modal } from "@/app/erp/components/ui";
import type { BoardCard, BoardColumn } from "@/lib/erp/pipelineBoard";

/** Move to: the same moves as dragging, for phones and keyboards. */
export function MoveToModal({
  card,
  columns,
  onClose,
  onPick,
}: {
  card: BoardCard;
  columns: BoardColumn[];
  onClose: () => void;
  onPick: (col: BoardColumn) => void;
}) {
  const note = (c: BoardColumn) => (c.outcome === "won" ? "creates an ERP project" : c.outcome === "lost" ? "asks for the reason" : null);
  return (
    <Modal open onClose={onClose} size="sm">
      <div className="space-y-3 p-5">
        <div>
          <h2 className="flex items-center gap-1 text-base font-semibold text-gray-900">
            Move to
            <InfoTip text="Changes the deal's stage in HubSpot. Moving to a won stage asks to confirm first, because the next HubSpot sync creates an ERP project for it. Moving to lost asks for the reason." />
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">{card.name}</p>
        </div>
        <ul className="space-y-1">
          {columns
            .filter((c) => c.stageId !== card.stageId)
            .map((c) => (
              <li key={c.stageId}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                >
                  {c.label}
                  {note(c) && <span className="text-xs text-gray-400">{note(c)}</span>}
                </button>
              </li>
            ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
