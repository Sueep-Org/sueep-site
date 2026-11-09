"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { checkSetting, datedHistoryText, formatSetting, type SettingDef } from "@/lib/erp/settingsRegistry";
import type { Dated, DatedMode } from "@/lib/erp/datedSettings";
import { todayEasternKey } from "@/lib/erp/dates";
import { DatedSaveModal } from "./DatedSaveModal";

export type SettingFieldProps = {
  def: SettingDef;
  value: string | number;
  saved: boolean;
  changedBy: string | null;
  changedAt: string | null;
  /** Dated settings: every value with its start day */
  history: Dated<number> | null;
};

/** One Settings value: box, Save when changed, Reset to default when not on the default. */
export function SettingField({ def, value, saved, changedBy, changedAt, history }: SettingFieldProps) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const dated = def.kind === "number" && def.dated ? def.dated : null;
  const [asking, setAsking] = useState(false);
  // A dated setting is on the default only when every date uses it
  const allDefault = history ? history.every((e) => e.value === def.default) : true;
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = draft.trim() !== String(value);
  const onDefault = String(value) === String(def.default) && allDefault;

  function startSave() {
    const checked = checkSetting(def, draft);
    if ("error" in checked) return setError(checked.error);
    if (dated) setAsking(true);
    else send("PUT");
  }

  async function reset() {
    if (dated) {
      const ok = await confirm({
        title: "Reset to default?",
        message: `This puts ${formatSetting(def, def.default)} back for every date, past ones too. Pay and commission already shown may change.`,
        confirmLabel: "Reset",
      });
      if (!ok) return;
    }
    send("DELETE");
  }

  async function send(method: "PUT" | "DELETE", mode?: DatedMode) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/erp/settings/values/${encodeURIComponent(def.key)}`, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "PUT" ? JSON.stringify({ value: draft, mode }) : undefined,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not save. Try again.");
    setAsking(false);
    if (method === "DELETE") setDraft(String(def.default));
    toast(method === "PUT" ? `${def.label} saved` : `${def.label} back to default`);
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) startSave();
      }}
      className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4"
    >
      <div className="min-w-[14rem] flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
          {def.label}
          <InfoTip text={def.info} />
        </div>
        <p className="mt-0.5 text-[11px] text-gray-400">
          {onDefault ? "Default" : `Default: ${formatSetting(def, def.default)}`}
          {saved && changedBy && changedAt && (
            <>
              {" · "}Changed by {changedBy} on {new Date(changedAt).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" })}
            </>
          )}
        </p>
        {history && history.length > 1 && <p className="mt-0.5 text-[11px] text-gray-500">{datedHistoryText(def, history)}</p>}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          {def.kind === "number" && def.prefix && <span>{def.prefix}</span>}
          {def.kind === "number" && def.toggle ? (
            <select
              className={`${inputClass.sm} w-24`}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError("");
              }}
              aria-label={def.label}
              disabled={busy}
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          ) : (
          <input
            type={def.kind === "date" ? "date" : "number"}
            className={`${inputClass.sm} ${def.kind === "date" ? "w-40" : "w-24 text-right"}`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError("");
            }}
            {...(def.kind === "number" ? { min: def.min, max: def.max, step: def.integer ? 1 : def.prefix === "$" ? 0.01 : "any" } : {})}
            aria-label={def.label}
            disabled={busy}
          />
          )}
          {def.kind === "number" && !def.toggle && <span>{def.unit}</span>}
        </label>
        {dirty ? (
          <>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(String(value))}>
              Cancel
            </Button>
          </>
        ) : (
          !onDefault && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={reset}>
              Reset to default
            </Button>
          )
        )}
      </div>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
      {asking && dated && (
        <DatedSaveModal
          label={def.label}
          dated={dated}
          oldText={formatSetting(def, value)}
          newText={formatSetting(def, draft.trim())}
          defaultFrom={todayEasternKey()}
          busy={busy}
          onCancel={() => setAsking(false)}
          onSave={(mode) => send("PUT", mode)}
        />
      )}
    </form>
  );
}
