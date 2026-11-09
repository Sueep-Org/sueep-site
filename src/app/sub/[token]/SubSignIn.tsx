"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { tr, type Lang } from "@/lib/erp/language";
import { LangToggle, useSubLang } from "./useSubLang";

export function SubSignIn({ token, firstName, maskedEmail, profileLang }: { token: string; firstName: string; maskedEmail: string; profileLang: Lang }) {
  const router = useRouter();
  const [lang, setLang] = useSubLang(profileLang);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(path: "code" | "verify", body?: unknown): Promise<boolean> {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/sub/${token}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? tr(lang, { en: "Something went wrong. Try again.", es: "Algo salió mal. Intenta de nuevo." }));
        return false;
      }
      return true;
    } catch {
      setError(tr(lang, { en: "Couldn't connect. Check your internet and try again.", es: "No hay conexión. Revisa tu internet e intenta de nuevo." }));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    if (await post("code")) {
      setSent(true);
      setCode("");
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (await post("verify", { code })) router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-gray-900">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-pink-600">Sueep</p>
          <LangToggle lang={lang} onChange={setLang} />
        </div>
        <h1 className="mt-2 text-lg font-semibold">
          {tr(lang, { en: "Hi", es: "Hola" })} {firstName}
        </h1>

        {!sent ? (
          <>
            <p className="mt-2 text-sm text-gray-600">
              {tr(lang, { en: "To keep your jobs private, we'll email a 6-digit code to", es: "Para mantener tus trabajos privados, enviaremos un código de 6 dígitos a" })}{" "}
              <span className="font-medium text-gray-900">{maskedEmail}</span>.{" "}
              {tr(lang, { en: "You only need to do this once on this phone.", es: "Solo necesitas hacerlo una vez en este teléfono." })}
            </p>
            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="mt-4 w-full rounded-md bg-pink-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {busy ? tr(lang, { en: "Sending…", es: "Enviando…" }) : tr(lang, { en: "Email me a code", es: "Envíame un código" })}
            </button>
          </>
        ) : (
          <form onSubmit={verify}>
            <p className="mt-2 text-sm text-gray-600">
              {tr(lang, { en: "We sent a code to", es: "Enviamos un código a" })} <span className="font-medium text-gray-900">{maskedEmail}</span>.{" "}
              {tr(lang, { en: "It works for 15 minutes.", es: "Sirve por 15 minutos." })}
            </p>
            <label htmlFor="sub-code" className="mt-4 block text-xs font-medium text-gray-600">
              {tr(lang, { en: "Code", es: "Código" })}
            </label>
            <input
              id="sub-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2.5 text-center text-xl tracking-[0.4em] text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
            <button
              type="submit"
              disabled={busy || code.replace(/\D/g, "").length !== 6}
              className="mt-4 w-full rounded-md bg-pink-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {busy ? tr(lang, { en: "Checking…", es: "Revisando…" }) : tr(lang, { en: "Continue", es: "Continuar" })}
            </button>
            <button type="button" onClick={sendCode} disabled={busy} className="mt-3 w-full text-center text-xs text-gray-500 hover:text-pink-600 disabled:opacity-50">
              {tr(lang, { en: "Didn't get it? Send a new code", es: "¿No te llegó? Envía un código nuevo" })}
            </button>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}
