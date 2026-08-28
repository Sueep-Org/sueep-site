"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the red/danger button for irreversible actions (deletes). Defaults to true. */
  danger?: boolean;
};

type ConfirmState = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Promise-based replacement for `window.confirm()`. Renders through the
 * shared `Modal`, so destructive actions (delete building, delete employee,
 * remove a user, ...) get a dialog styled like the rest of the ERP instead
 * of the browser's native confirm box — which looks identical whether it's
 * gating "not today" or "permanently delete this employee".
 *
 * Mounted once in the ERP shell layout (`ErpProviders`). Call `useConfirm()`
 * from any client component underneath it:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ message: "Delete this building?", danger: true }))) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ danger: true, ...options, resolve });
    });
  }, []);

  function close(ok: boolean) {
    state?.resolve(ok);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={state !== null} onClose={() => close(false)} size="sm">
        {state && (
          <>
            <h2 className="text-base font-semibold text-gray-900">{state.title ?? "Are you sure?"}</h2>
            <p className="mt-2 text-sm text-gray-600">{state.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => close(false)}>
                {state.cancelLabel ?? "Cancel"}
              </Button>
              <Button variant={state.danger ? "danger" : "primary"} size="sm" onClick={() => close(true)}>
                {state.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
