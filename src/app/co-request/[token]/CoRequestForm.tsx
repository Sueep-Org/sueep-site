"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CoRequestView } from "@/lib/erp/subCoRequests";
import { dateLocale, tr } from "@/lib/erp/language";
import { MAX_UPLOAD_BYTES, shrinkImage } from "@/lib/shrinkImage";

type Photo = { key: string; id: string | null; preview: string; error: string | null };
type OtherLine = { key: string; description: string; quantity: number };

const PHOTOS_MAX = 10;
const TONE: Record<CoRequestView["past"][number]["status"]["tone"], string> = {
  gray: "bg-gray-100 text-gray-700",
  amber: "bg-amber-50 text-amber-800",
  green: "bg-emerald-50 text-emerald-800",
  red: "bg-red-50 text-red-700",
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });
}

/**
 * A sub's change order request: photos, issues from the building's CO
 * package with their pay, or Other for the office to price. Shows only the
 * sub's pay, never what we charge.
 */
export function CoRequestForm({ token, view }: { token: string; view: CoRequestView }) {
  const router = useRouter();
  const t = (en: string, es: string) => tr(view.lang, { en, es });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [others, setOthers] = useState<OtherLine[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const keySeq = useRef(0);
  const nextKey = () => String(++keySeq.current);

  const uploading = photos.some((p) => !p.id && !p.error);
  const readyPhotos = photos.filter((p) => p.id);
  const chosen = view.issues.filter((i) => (qty[i.id] ?? 0) > 0);
  const total = chosen.reduce((s, i) => s + i.subPayCents * (qty[i.id] ?? 0), 0);
  const lineCount = chosen.length + others.length;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = PHOTOS_MAX - photos.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) setError(t(`${PHOTOS_MAX} photos max.`, `Máximo ${PHOTOS_MAX} fotos.`));
    const added = list.map((file) => ({ file, photo: { key: nextKey(), id: null, preview: URL.createObjectURL(file), error: null } as Photo }));
    setPhotos((cur) => [...cur, ...added.map((a) => a.photo)]);
    // One at a time: request bodies are capped, so each photo is its own upload
    for (const { file, photo } of added) {
      let result: Partial<Photo>;
      try {
        const small = await shrinkImage(file);
        if (small.size > MAX_UPLOAD_BYTES) throw new Error(t("Too big", "Muy grande"));
        const body = new FormData();
        body.append("file", small);
        const res = await fetch(`/api/co-request/${token}/photos`, { method: "POST", body });
        const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
        result = res.ok && data?.id ? { id: data.id } : { error: data?.error ?? t("Upload failed", "Error al subir") };
      } catch (e) {
        result = { error: e instanceof Error && e.message ? e.message : t("Upload failed", "Error al subir") };
      }
      setPhotos((cur) => cur.map((p) => (p.key === photo.key ? { ...p, ...result } : p)));
    }
  }

  function removePhoto(photo: Photo) {
    setPhotos((cur) => cur.filter((p) => p.key !== photo.key));
    URL.revokeObjectURL(photo.preview);
    if (photo.id) fetch(`/api/co-request/${token}/photos/${photo.id}`, { method: "DELETE" }).catch(() => {});
  }

  function setIssueQty(id: string, n: number) {
    setQty((cur) => ({ ...cur, [id]: Math.max(0, Math.min(99, n)) }));
  }

  async function send() {
    setError(null);
    if (!readyPhotos.length) return setError(t("Add at least one photo.", "Agrega al menos una foto."));
    if (!lineCount) return setError(t("Pick at least one issue.", "Elige al menos un problema."));
    if (others.some((o) => o.description.trim().length < 3)) return setError(t("Describe the Other issue.", "Describe el otro problema."));
    setBusy(true);
    try {
      const res = await fetch(`/api/co-request/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: [
            ...chosen.map((i) => ({ issueId: i.id, quantity: qty[i.id] })),
            ...others.map((o) => ({ issueId: null, quantity: o.quantity, description: o.description })),
          ],
          photoIds: readyPhotos.map((p) => p.id),
          note,
        }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !data?.id) return setError(data?.error ?? t("Couldn't send. Try again.", "No se pudo enviar. Inténtalo de nuevo."));
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setQty({});
      setOthers([]);
      setNote("");
      setSent(true);
      router.refresh();
    } catch {
      setError(t("Couldn't reach the server. Check your connection and try again.", "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  const card = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";

  return (
    <div className="mt-3 space-y-4">
      <div className={card}>
        <h1 className="text-lg font-semibold text-gray-900">
          {t("Hi", "Hola")} {view.firstName},
        </h1>
        <p className="mt-1 text-sm text-gray-700">
          {t("Request a change order for", "Solicita una orden de cambio para")} <strong>{view.unit}</strong>
          {view.building && !view.unit.includes(view.building) ? ` (${view.building})` : ""}.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          {t("Don't start the extra work until it's approved.", "No empieces el trabajo extra hasta que sea aprobado.")}
        </p>
      </div>

      {sent && (
        <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {t("Sent. You'll get an email when it's approved or not.", "Enviada. Recibirás un correo cuando sea aprobada o no.")}
        </p>
      )}

      {view.closed ? (
        <p className="rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-700">{view.closed}</p>
      ) : (
        <>
          <section className={card}>
            <h2 className="text-sm font-semibold text-gray-900">1. {t("Photos", "Fotos")}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{t("At least 1, up to 10.", "Al menos 1, hasta 10.")}</p>
            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <div key={p.key} className="relative aspect-square overflow-hidden rounded-md bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt="" className={`h-full w-full object-cover ${p.id ? "" : "opacity-50"}`} />
                    {!p.id && !p.error && <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-center text-[11px] text-white">{t("Uploading…", "Subiendo…")}</span>}
                    {p.error && <span className="absolute inset-x-0 bottom-0 bg-red-600/90 px-1 py-0.5 text-center text-[11px] text-white">{p.error}</span>}
                    <button
                      type="button"
                      onClick={() => removePhoto(p)}
                      aria-label={t("Remove photo", "Quitar foto")}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            {photos.length < PHOTOS_MAX && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-3 w-full rounded-md border border-dashed border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:border-pink-400 hover:text-pink-700"
              >
                + {t("Add photos", "Agregar fotos")}
              </button>
            )}
          </section>

          <section className={card}>
            <h2 className="text-sm font-semibold text-gray-900">2. {t("What needs doing?", "¿Qué hay que hacer?")}</h2>
            <ul className="mt-3 divide-y divide-gray-100">
              {view.issues.map((i) => {
                const n = qty[i.id] ?? 0;
                return (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900">{i.label}</p>
                      <p className="text-xs text-gray-500">
                        {money(i.subPayCents)} {i.per}
                      </p>
                    </div>
                    {n === 0 ? (
                      <button type="button" onClick={() => setIssueQty(i.id, 1)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                        {t("Add", "Agregar")}
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setIssueQty(i.id, n - 1)} aria-label={t("Less", "Menos")} className="h-8 w-8 rounded-md border border-gray-300 text-gray-700">
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold text-gray-900">{n}</span>
                        <button type="button" onClick={() => setIssueQty(i.id, n + 1)} aria-label={t("More", "Más")} className="h-8 w-8 rounded-md border border-gray-300 text-gray-700">
                          +
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {others.map((o) => (
              <div key={o.key} className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">{t("Other", "Otro")}</p>
                  <button type="button" onClick={() => setOthers((cur) => cur.filter((x) => x.key !== o.key))} className="text-xs text-gray-500 hover:text-red-600">
                    {t("Remove", "Quitar")}
                  </button>
                </div>
                <textarea
                  value={o.description}
                  onChange={(e) => setOthers((cur) => cur.map((x) => (x.key === o.key ? { ...x, description: e.target.value } : x)))}
                  rows={2}
                  maxLength={500}
                  placeholder={t("Describe the issue", "Describe el problema")}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
                <p className="mt-1 text-xs text-gray-500">{t("The office will set the pay for this.", "La oficina pondrá el pago para esto.")}</p>
              </div>
            ))}
            {others.length < 5 && (
              <button
                type="button"
                onClick={() => setOthers((cur) => [...cur, { key: nextKey(), description: "", quantity: 1 }])}
                className="mt-3 text-sm font-semibold text-pink-600 hover:text-pink-700"
              >
                + {t("Other (not on the list)", "Otro (no está en la lista)")}
              </button>
            )}
          </section>

          <section className={card}>
            <label htmlFor="co-note" className="text-sm font-semibold text-gray-900">
              3. {t("Note (optional)", "Nota (opcional)")}
            </label>
            <textarea
              id="co-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
          </section>

          <div className={`${card} sticky bottom-3`}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-gray-700">{t("Your pay", "Tu pago")}</span>
              <span className="text-lg font-semibold text-gray-900">{money(total)}</span>
            </div>
            {others.length > 0 && <p className="text-xs text-gray-500">{t("Plus Other, set by the office.", "Más Otro, lo pone la oficina.")}</p>}
            {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <button
              type="button"
              onClick={send}
              disabled={busy || uploading}
              className="mt-3 w-full rounded-md bg-pink-600 px-4 py-3 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {busy ? t("Sending…", "Enviando…") : uploading ? t("Uploading photos…", "Subiendo fotos…") : t("Send request", "Enviar solicitud")}
            </button>
          </div>
        </>
      )}

      {view.past.length > 0 && (
        <section className={card}>
          <h2 className="text-sm font-semibold text-gray-900">{t("Your requests for this unit", "Tus solicitudes para esta unidad")}</h2>
          <ul className="mt-3 space-y-4">
            {view.past.map((r) => (
              <li key={r.id} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">
                    {new Date(r.sentAt).toLocaleString(dateLocale(view.lang), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[r.status.tone]}`}>{r.status.text}</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-gray-800">
                  {r.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>
                        {l.quantity > 1 ? `${l.quantity} × ` : ""}
                        {l.label}
                        {l.description ? <span className="text-gray-500">: {l.description}</span> : null}
                      </span>
                      <span className="shrink-0 text-gray-600">{l.subPayCents == null ? t("Office sets", "Oficina") : money(l.subPayCents)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-right text-sm font-semibold text-gray-900">
                  {money(r.subTotalCents)}
                  {r.hasUnpriced ? <span className="font-normal text-gray-500"> + {t("Other", "Otro")}</span> : null}
                </p>
                {r.photoIds.length > 0 && (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto">
                    {r.photoIds.map((id) => (
                      <a key={id} href={`/api/co-request/${token}/photos/${id}`} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/co-request/${token}/photos/${id}`} alt="" className="h-14 w-14 rounded object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
