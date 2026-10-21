"use client";

import { useState } from "react";
import type { ConfirmationStatus, ResponseView } from "@/lib/erp/scheduleConfirmations";
import { tr } from "@/lib/erp/language";

/**
 * Confirm or Can't make it for one scheduled day. Nothing is recorded until a
 * button is clicked (email scanners open links on their own). The answer can
 * be changed until the day starts.
 */
export function ResponseForm({ token, view }: { token: string; view: ResponseView }) {
  const [status, setStatus] = useState<ConfirmationStatus>(view.status);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState(view.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (en: string, es: string) => tr(view.lang, { en, es });

  async function answer(a: "CONFIRMED" | "DECLINED") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedule-response/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: a, reason: a === "DECLINED" ? reason : null }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; status?: ConfirmationStatus } | null;
      if (!res.ok || !data || data.error) return setError(data?.error ?? t("Couldn't save your answer. Try again.", "No se pudo guardar tu respuesta. Inténtalo de nuevo."));
      setStatus(data.status ?? a);
      setDeclining(false);
    } catch {
      setError(t("Couldn't reach the server. Check your connection and try again.", "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  const closed = view.past || status === "CANCELLED";
  return (
    <div className="mt-2 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">
          {t("Hi", "Hola")} {view.personName.split(/\s+/)[0]},
        </h1>
        <p className="mt-1 text-sm text-gray-700">
          {t("You're scheduled for", "Estás programado para")} <strong>{view.title}</strong> {t("on", "el")} <strong>{view.day}</strong> (
          {view.role.toLowerCase()}).
        </p>
      </div>

      {status === "CANCELLED" && <p className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">{t("You're no longer scheduled for this day.", "Ya no estás programado para este día.")}</p>}
      {view.past && status !== "CANCELLED" && <p className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">{t("This day has already passed.", "Este día ya pasó.")}</p>}
      {!closed && status === "CONFIRMED" && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t("Thanks, you're confirmed. See you there.", "Gracias, estás confirmado. Nos vemos allá.")}</p>}
      {!closed && status === "DECLINED" && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("Thanks for letting us know. The office has been told you can't make it.", "Gracias por avisarnos. La oficina ya sabe que no puedes ir.")}
        </p>
      )}

      {!closed && !declining && (
        <div className="flex flex-wrap gap-2">
          {status !== "CONFIRMED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => answer("CONFIRMED")}
              className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {status === "DECLINED" ? t("I can make it after all", "Al final sí puedo ir") : t("Confirm", "Confirmar")}
            </button>
          )}
          {status !== "DECLINED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeclining(true)}
              className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t("Can't make it", "No puedo ir")}
            </button>
          )}
        </div>
      )}

      {!closed && declining && (
        <div className="space-y-2">
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
            {t("Why? (optional)", "¿Por qué? (opcional)")}
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => answer("DECLINED")}
              className="rounded-md bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
            >
              {busy ? t("Sending…", "Enviando…") : t("Send", "Enviar")}
            </button>
            <button type="button" disabled={busy} onClick={() => setDeclining(false)} className="px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700">
              {t("Back", "Volver")}
            </button>
          </div>
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
