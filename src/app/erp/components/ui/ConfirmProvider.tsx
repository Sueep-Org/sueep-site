"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { inputClass } from "./styles";
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

export type AskTextOptions = {
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
};

type AskTextState = AskTextOptions & { resolve: (text: string | null) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);
const AskTextContext = createContext<((options: AskTextOptions) => Promise<string | null>) | null>(null);

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

  const [ask, setAsk] = useState<AskTextState | null>(null);
  const [text, setText] = useState("");
  const askText = useCallback((options: AskTextOptions) => {
    return new Promise<string | null>((resolve) => {
      setText("");
      setAsk({ ...options, resolve });
    });
  }, []);

  function closeAsk(answer: string | null) {
    ask?.resolve(answer);
    setAsk(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
    <AskTextContext.Provider value={askText}>
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
      <Modal open={ask !== null} onClose={() => closeAsk(null)} size="sm">
        {ask && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) closeAsk(text.trim());
            }}
          >
            <h2 className="text-base font-semibold text-gray-900">{ask.title}</h2>
            {ask.message && <p className="mt-2 text-sm text-gray-600">{ask.message}</p>}
            <textarea
              autoFocus
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={ask.placeholder}
              className={inputClass.md.replace("mt-1", "mt-3")}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => closeAsk(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!text.trim()}>
                {ask.confirmLabel ?? "Save"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </AskTextContext.Provider>
    </ConfirmContext.Provider>
  );
}

/** Like useConfirm, for a required short answer (a reason). Resolves to
 * the trimmed text, or null when cancelled. */
export function useAskText() {
  const ctx = useContext(AskTextContext);
  if (!ctx) throw new Error("useAskText must be used within ConfirmProvider");
  return ctx;
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
