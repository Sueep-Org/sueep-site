"use client";

import { useCallback, useRef } from "react";
import { useConfirm } from "./ui";

/**
 * Pop-up shown when a sub with missing or expired insurance is added to a
 * job (see insuranceWarning in subCoverage.ts). Warning only: resolves true
 * when there's nothing to warn about or the user picks "Add anyway".
 *
 * `previousId` is who was already in that slot, so re-saving a day with the
 * same sub doesn't ask again. A sub confirmed once isn't asked about again
 * while the calling component stays open.
 */
export function useInsuranceCheck(contractors: { id: string; insuranceWarning?: string | null }[]) {
  const confirm = useConfirm();
  const confirmed = useRef(new Set<string>());

  return useCallback(
    async (contractorId: string | null | undefined, previousId?: string | null) => {
      if (!contractorId || contractorId === previousId || confirmed.current.has(contractorId)) return true;
      const warning = contractors.find((c) => c.id === contractorId)?.insuranceWarning;
      if (!warning) return true;
      const ok = await confirm({
        title: "Insurance warning",
        message: `${warning} You can still add them.`,
        confirmLabel: "Add anyway",
        danger: false,
      });
      if (ok) confirmed.current.add(contractorId);
      return ok;
    },
    [contractors, confirm],
  );
}
