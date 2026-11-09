"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dateLocale, tr, type Lang } from "@/lib/erp/language";
import type { PortalFix } from "@/lib/erp/subReviews";
import { preparePhoto } from "@/lib/subPhotoClient";

/**
 * Fix requests from Sueep's review of the sub's work (subReviews.ts), shown
 * above the tabs until they send fix photos back. Needs signal: fix photos
 * aren't kept on the phone like check-ins are.
 */

const OFFLINE = { en: "Couldn't connect. Try again when you have signal.", es: "No hay conexión. Intenta de nuevo cuando tengas señal." };

function dayLabel(key: string, lang: Lang): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function Thumb({ token, id, onRemove, lang }: { token: string; id: string; onRemove?: () => void; lang: Lang }) {
  return (
    <li className="relative aspect-square overflow-hidden rounded-md bg-gray-100">
      <a href={`/api/sub/${token}/photos/${id}`} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/sub/${token}/photos/${id}?size=thumb`} alt="" className="h-full w-full object-cover" />
      </a>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={tr(lang, { en: "Remove photo", es: "Quitar foto" })}
          className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm text-white"
        >
          ×
        </button>
      )}
    </li>
  );
}

function FixCard({ token, fix, lang }: { token: string; fix: PortalFix; lang: Lang }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"photo" | "send" | null>(null);
  const [error, setError] = useState("");

  async function call(url: string, init: RequestInit): Promise<boolean> {
    try {
      const res = await fetch(url, init);
      if (res.ok) return true;
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || tr(lang, { en: "Something went wrong. Try again.", es: "Algo salió mal. Intenta de nuevo." }));
    } catch {
      setError(tr(lang, OFFLINE));
    }
    return false;
  }

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    setBusy("photo");
    setError("");
    const form = new FormData();
    form.append("file", await preparePhoto(file, new Date()), "fix.jpg");
    if (await call(`/api/sub/${token}/reviews/${fix.reviewId}/photos`, { method: "POST", body: form })) router.refresh();
    setBusy(null);
  }

  async function remove(id: string) {
    setError("");
    if (await call(`/api/sub/${token}/photos/${id}`, { method: "DELETE" })) router.refresh();
  }

  async function send() {
    setBusy("send");
    setError("");
    if (await call(`/api/sub/${token}/reviews/${fix.reviewId}/send`, { method: "POST" })) router.refresh();
    setBusy(null);
  }

  return (
    <li className="rounded-lg border-2 border-red-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-600">{tr(lang, { en: "Fixes needed", es: "Arreglos pendientes" })}</p>
      <h2 className="mt-0.5 text-base font-semibold text-gray-900">{fix.title}</h2>
      <p className="text-xs text-gray-500">{dayLabel(fix.dateKey, lang)}</p>
      {fix.items.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-800">
          {fix.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {fix.note && <p className="mt-2 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">{fix.note}</p>}
      {fix.issuePhotoIds.length > 0 && (
        <>
          <p className="mt-3 text-xs font-medium text-gray-600">{tr(lang, { en: "What Sueep saw", es: "Lo que vio Sueep" })}</p>
          <ul className="mt-1 grid grid-cols-4 gap-1.5">
            {fix.issuePhotoIds.map((id) => (
              <Thumb key={id} token={token} id={id} lang={lang} />
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-sm font-medium text-gray-800">
        {tr(lang, { en: "Your fix photos", es: "Tus fotos del arreglo" })} <span className="text-gray-500">{fix.fixPhotoIds.length}</span>
      </p>
      {fix.fixPhotoIds.length > 0 && (
        <ul className="mt-1 grid grid-cols-4 gap-1.5">
          {fix.fixPhotoIds.map((id) => (
            <Thumb key={id} token={token} id={id} lang={lang} onRemove={() => void remove(id)} />
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void addPhoto(f);
        }}
      />
      <button
        type="button"
        disabled={!!busy}
        onClick={() => input.current?.click()}
        className="mt-2 w-full rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:border-pink-300 hover:text-pink-700 disabled:opacity-50"
      >
        {busy === "photo" ? tr(lang, { en: "Sending photo…", es: "Enviando foto…" }) : `+ ${tr(lang, { en: "Take a photo of the fix", es: "Tomar foto del arreglo" })}`}
      </button>
      <button
        type="button"
        disabled={!!busy || fix.fixPhotoIds.length === 0}
        onClick={() => void send()}
        className="mt-2 w-full rounded-lg bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy === "send" ? tr(lang, { en: "Sending…", es: "Enviando…" }) : tr(lang, { en: "Fixed, send for review", es: "Listo, enviar a revisión" })}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}

export function FixCards({ token, fixes, lang }: { token: string; fixes: PortalFix[]; lang: Lang }) {
  if (fixes.length === 0) return null;
  return (
    <ul className="space-y-3">
      {fixes.map((f) => (
        <FixCard key={f.reviewId} token={token} fix={f} lang={lang} />
      ))}
    </ul>
  );
}
