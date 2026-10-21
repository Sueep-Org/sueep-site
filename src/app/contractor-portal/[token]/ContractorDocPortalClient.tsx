"use client";

import { useState } from "react";
import { tr, type Lang } from "@/lib/erp/language";

type PaperworkItem = { label: string; url: string };
type UploadState = "idle" | "uploading" | "done" | "error";

type Props = {
  token: string;
  name: string;
  lang: Lang;
  paperwork: PaperworkItem[];
};

export function ContractorDocPortalClient({ token, name, lang, paperwork: initial }: Props) {
  const t = (en: string, es: string) => tr(lang, { en, es });
  const [items, setItems] = useState<PaperworkItem[]>(initial);
  const [uploadState, setUploadState] = useState<Record<string, UploadState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleFileChange(label: string, file: File) {
    setUploadState((s) => ({ ...s, [label]: "uploading" }));
    setErrors((e) => ({ ...e, [label]: "" }));

    const fd = new FormData();
    fd.append("label", label);
    fd.append("file", file);

    try {
      const res = await fetch(`/api/contractor-portal/${token}/upload`, {
        method: "POST",
        body: fd,
      });
      // A rejection from the hosting layer (e.g. 413) is plain text, not JSON.
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(res.status === 413 ? t("File too large (max 4 MB)", "Archivo muy grande (máx. 4 MB)") : json.error ?? t("Upload failed", "No se pudo subir"));

      setItems((prev) => prev.map((p) => (p.label === label ? { ...p, url: "uploaded" } : p)));
      setUploadState((s) => ({ ...s, [label]: "done" }));
    } catch (err) {
      setUploadState((s) => ({ ...s, [label]: "error" }));
      setErrors((e) => ({ ...e, [label]: err instanceof Error ? err.message : t("Upload failed", "No se pudo subir") }));
    }
  }

  const allDone = items.every((p) => p.url);

  return (
    <div className="min-h-screen bg-white px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <svg className="mx-auto mb-4 h-10 w-10 text-[#E73C6E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">{t("Upload your documents", "Sube tus documentos")}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t(`Hi ${name}, please upload each required document below.`, `Hola ${name}, sube cada documento requerido abajo.`)}
          </p>
          <p className="mt-1 text-xs text-gray-400">{t("PDF, JPEG, or PNG · max 4 MB each", "PDF, JPEG o PNG · máx. 4 MB cada uno")}</p>
        </div>

        {allDone && (
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">
              {t("All documents uploaded. You're all set!", "Todos los documentos están subidos. ¡Listo!")}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {items.map((item) => {
            const state = uploadState[item.label] ?? (item.url ? "done" : "idle");
            const err = errors[item.label];

            return (
              <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    {state === "done" && (
                      <p className="mt-1 text-xs text-emerald-600 font-medium">{t("Uploaded", "Subido")}</p>
                    )}
                    {state === "uploading" && (
                      <p className="mt-1 text-xs text-blue-600">{t("Uploading…", "Subiendo…")}</p>
                    )}
                    {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
                  </div>
                  <div className="shrink-0">
                    {state === "done" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        ✓ {t("Done", "Listo")}
                      </span>
                    ) : (
                      <label className="cursor-pointer rounded-md bg-[#E73C6E] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity">
                        {state === "uploading" ? t("Uploading…", "Subiendo…") : t("Choose file", "Elegir archivo")}
                        <input
                          type="file"
                          className="sr-only"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          disabled={state === "uploading"}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleFileChange(item.label, file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          {t("Having trouble? Reply to the email we sent you.", "¿Tienes problemas? Responde al correo que te enviamos.")}
        </p>
      </div>
    </div>
  );
}
