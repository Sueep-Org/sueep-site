"use client";

import { useState } from "react";
import { tr, type Lang } from "@/lib/erp/language";

type Props = {
  token: string;
  name: string;
  lang: Lang;
  initial: {
    address: string | null;
    dateOfBirth: string | null;
    ssn: string | null;
    bankAccountType: string | null;
    bankAccountNumber: string | null;
    bankRoutingNumber: string | null;
    phone: string | null;
  };
};

const fieldCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

export function EmployeeInfoPortalClient({ token, name, lang, initial }: Props) {
  const t = (en: string, es: string) => tr(lang, { en, es });
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth ?? "");
  const [ssn, setSsn] = useState(initial.ssn ?? "");
  const [bankAccountType, setBankAccountType] = useState(initial.bankAccountType ?? "checking");
  const [bankAccountNumber, setBankAccountNumber] = useState(initial.bankAccountNumber ?? "");
  const [bankRoutingNumber, setBankRoutingNumber] = useState(initial.bankRoutingNumber ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(initial.address || initial.ssn || initial.bankAccountNumber));
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/employee-info/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: phone || null,
          address: address || null,
          dateOfBirth: dateOfBirth || null,
          ssn: ssn || null,
          bankAccountType,
          bankAccountNumber: bankAccountNumber || null,
          bankRoutingNumber: bankRoutingNumber || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? t("Save failed", "No se pudo guardar"));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Save failed", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <svg className="mx-auto mb-4 h-10 w-10 text-[#E73C6E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">{t("Employee Information", "Información de empleado")}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t(`Hi ${name}, please fill in your information below.`, `Hola ${name}, llena tu información abajo.`)}
          </p>
        </div>

        {saved && (
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">
              {t(
                "Information saved. You can update it below anytime before the link expires.",
                "Información guardada. Puedes actualizarla abajo en cualquier momento antes de que venza el enlace."
              )}
            </p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className={labelCls}>{t("Phone number", "Número de teléfono")}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>{t("Address", "Dirección")}</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              placeholder={t("Street, City, State, ZIP", "Calle, ciudad, estado, código postal")}
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>{t("Date of birth", "Fecha de nacimiento")}</label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>{t("Social Security Number (SSN)", "Número de Seguro Social (SSN)")}</label>
            <input
              type="text"
              value={ssn}
              onChange={(e) => setSsn(e.target.value)}
              placeholder="XXX-XX-XXXX"
              className={fieldCls}
            />
          </div>

          <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
            <legend className="text-sm font-semibold text-gray-800 px-1">{t("Bank Account Info", "Información bancaria")}</legend>

            <div>
              <label className={labelCls}>{t("Account type", "Tipo de cuenta")}</label>
              <select
                value={bankAccountType}
                onChange={(e) => setBankAccountType(e.target.value)}
                className={fieldCls}
              >
                <option value="checking">{t("Checking", "Cheques")}</option>
                <option value="savings">{t("Savings", "Ahorros")}</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>{t("Account number", "Número de cuenta")}</label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder={t("Enter account number", "Escribe el número de cuenta")}
                className={fieldCls}
              />
            </div>

            <div>
              <label className={labelCls}>{t("Routing number", "Número de ruta (routing)")}</label>
              <input
                type="text"
                value={bankRoutingNumber}
                onChange={(e) => setBankRoutingNumber(e.target.value)}
                placeholder={t("Enter routing number", "Escribe el número de ruta")}
                className={fieldCls}
              />
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-[#E73C6E] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? t("Saving…", "Guardando…") : saved ? t("Update information", "Actualizar información") : t("Submit information", "Enviar información")}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-gray-400">
          {t("Having trouble? Reply to the email we sent you.", "¿Tienes problemas? Responde al correo que te enviamos.")}
        </p>
      </div>
    </div>
  );
}
