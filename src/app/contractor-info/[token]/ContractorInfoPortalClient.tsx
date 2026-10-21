"use client";

import { useState } from "react";
import { CONTRACTOR_MANUAL_SECTIONS, subFieldName, type SubField } from "@/lib/erp/subcontractorQuestionnaire";
import { tr, type Lang } from "@/lib/erp/language";

type Props = {
  token: string;
  name: string;
  lang: Lang;
  /** True when an ERP staffer has linked this contractor to a submitted
   * /careers application — Company profile / Insurance / Licensing already
   * have answers from that application, so this form skips re-asking for
   * them (see ContractorQuestionnaireCard on the ERP profile). */
  isLinkedToApplication: boolean;
  initial: {
    contractorFullName: string | null;
    address: string | null;
    dateOfBirth: string | null;
    ssn: string | null;
    bankAccountType: string | null;
    bankAccountNumber: string | null;
    bankRoutingNumber: string | null;
    phone: string | null;
    hasInsurance: boolean | null;
    workersCompCarrier: string | null;
    workersCompPolicyNumber: string | null;
    workersCompExpiresAt: string | null;
    workersCompDocFilename: string | null;
    glCarrier: string | null;
    glPolicyNumber: string | null;
    glExpiresAt: string | null;
    /** Dollar amounts as text */
    glOccurrence: string;
    glAggregate: string;
    /** sub_<key>-keyed values for the Company profile / additional
     * insurance / licensing fields below, already saved to
     * Contractor.manualApplicationInfo. */
    questionnaireValues: Record<string, string>;
  };
};

const fieldCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

const COMPANY_FIELDS = CONTRACTOR_MANUAL_SECTIONS.find((s) => s.id === "company")?.fields ?? [];
const INSURANCE_FIELDS = CONTRACTOR_MANUAL_SECTIONS.find((s) => s.id === "insurance")?.fields ?? [];
const LICENSING_FIELDS = CONTRACTOR_MANUAL_SECTIONS.find((s) => s.id === "licensing")?.fields ?? [];

/** Spanish labels for the company / insurance / licensing questions (English stays in subcontractorQuestionnaire.ts). */
const FIELD_LABEL_ES: Record<string, string> = {
  legalCompanyName: "Nombre legal de la empresa",
  dba: "DBA / nombre comercial (si aplica)",
  federalEin: "EIN federal",
  businessAddress: "Dirección de la empresa",
  mailingAddress: "Dirección postal (si es diferente)",
  primaryContact: "Contacto principal",
  officePhone: "Teléfono de oficina",
  cellPhone: "Celular",
  companyEmail: "Correo electrónico",
  website: "Sitio web",
  yearBusinessStarted: "Año en que empezó la empresa",
  numberOfEmployees: "Número de empleados",
  numberOfCrews: "Número de cuadrillas",
  serviceArea: "Área de servicio (estados/ciudades)",
  unionStatus: "¿Sindicalizado o no sindicalizado?",
  diverseOwned: "¿Empresa de minoría, mujer o veterano?",
  generalLiabilityCoverage: "Cobertura de responsabilidad general",
  workersCompensation: "Compensación de trabajadores",
  commercialAuto: "Auto comercial",
  umbrellaLiability: "Responsabilidad paraguas (umbrella)",
  professionalLiability: "Responsabilidad profesional (si aplica)",
  stateContractorLicenseNumbers: "Número(s) de licencia estatal de contratista",
  licenseClassification: "Clasificación de la licencia",
  statesLicensedIn: "Estados donde tiene licencia",
};
const OPTION_ES: Record<string, string> = { Union: "Sindicalizado", "Non-Union": "No sindicalizado" };

function fieldLabel(field: SubField, lang: Lang): string {
  return lang === "es" ? FIELD_LABEL_ES[field.key] ?? field.label : field.label;
}

function questionnaireInput(field: SubField, value: string, onChange: (v: string) => void, lang: Lang) {
  if (field.type === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
        <option value="">{tr(lang, { en: "Select", es: "Elegir" })}</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {lang === "es" ? OPTION_ES[opt] ?? opt : opt}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={fieldCls}
    />
  );
}

export function ContractorInfoPortalClient({ token, name, lang, isLinkedToApplication, initial }: Props) {
  const t = (en: string, es: string) => tr(lang, { en, es });
  const [contractorFullName, setContractorFullName] = useState(initial.contractorFullName ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth ?? "");
  const [ssn, setSsn] = useState(initial.ssn ?? "");
  const [bankAccountType, setBankAccountType] = useState(initial.bankAccountType ?? "checking");
  const [bankAccountNumber, setBankAccountNumber] = useState(initial.bankAccountNumber ?? "");
  const [bankRoutingNumber, setBankRoutingNumber] = useState(initial.bankRoutingNumber ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [hasInsurance, setHasInsurance] = useState<boolean | null>(initial.hasInsurance ?? null);
  const [workersCompCarrier, setWorkersCompCarrier] = useState(initial.workersCompCarrier ?? "");
  const [workersCompPolicyNumber, setWorkersCompPolicyNumber] = useState(initial.workersCompPolicyNumber ?? "");
  const [workersCompExpiresAt, setWorkersCompExpiresAt] = useState(
    initial.workersCompExpiresAt ? initial.workersCompExpiresAt.slice(0, 10) : ""
  );
  const [workersCompDocFilename, setWorkersCompDocFilename] = useState(initial.workersCompDocFilename ?? "");
  const [gl, setGl] = useState({
    glCarrier: initial.glCarrier ?? "",
    glPolicyNumber: initial.glPolicyNumber ?? "",
    glExpiresAt: initial.glExpiresAt ? initial.glExpiresAt.slice(0, 10) : "",
    glOccurrenceCents: initial.glOccurrence,
    glAggregateCents: initial.glAggregate,
  });
  const [uploadingCoi, setUploadingCoi] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [questionnaireValues, setQuestionnaireValues] = useState<Record<string, string>>(initial.questionnaireValues);

  function setQuestionnaireField(key: string, value: string) {
    setQuestionnaireValues((prev) => ({ ...prev, [subFieldName(key)]: value }));
  }

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(initial.contractorFullName));
  const [error, setError] = useState("");

  async function onCoiFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCoi(true);
    setUploadError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/contractor-info/${token}/upload`, { method: "POST", body });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? t("Upload failed", "No se pudo subir"));
      setWorkersCompDocFilename(file.name);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("Upload failed", "No se pudo subir"));
    } finally {
      setUploadingCoi(false);
      e.target.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contractorFullName.trim()) {
      setError(t("Full name is required.", "El nombre completo es obligatorio."));
      return;
    }
    if (hasInsurance === null) {
      setError(t("Please indicate whether you have insurance.", "Indica si tienes seguro."));
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/contractor-info/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractorFullName,
          address: address || null,
          dateOfBirth: dateOfBirth || null,
          ssn: ssn || null,
          bankAccountType,
          bankAccountNumber: bankAccountNumber || null,
          bankRoutingNumber: bankRoutingNumber || null,
          phone: phone || null,
          hasInsurance,
          workersCompCarrier: workersCompCarrier || null,
          workersCompPolicyNumber: workersCompPolicyNumber || null,
          workersCompExpiresAt: workersCompExpiresAt || null,
          // Limits are sent as dollar text; the server converts to cents.
          ...gl,
          glExpiresAt: gl.glExpiresAt || null,
          ...(isLinkedToApplication ? {} : { questionnaireValues }),
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
          <h1 className="text-2xl font-bold text-gray-900">{t("Contractor Information", "Información de contratista")}</h1>
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
            <label className={labelCls}>{t("Full name *", "Nombre completo *")}</label>
            <input
              type="text"
              value={contractorFullName}
              onChange={(e) => setContractorFullName(e.target.value)}
              placeholder={t("Your full legal name", "Tu nombre legal completo")}
              className={fieldCls}
            />
          </div>

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

          <div>
            <label className={labelCls}>{t("Do you have insurance? *", "¿Tienes seguro? *")}</label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="hasInsurance"
                  checked={hasInsurance === true}
                  onChange={() => setHasInsurance(true)}
                  className="accent-[#E73C6E]"
                />
                <span className="text-sm text-gray-800">{t("Yes", "Sí")}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="hasInsurance"
                  checked={hasInsurance === false}
                  onChange={() => setHasInsurance(false)}
                  className="accent-[#E73C6E]"
                />
                <span className="text-sm text-gray-800">No</span>
              </label>
            </div>
          </div>

          <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
            <legend className="text-sm font-semibold text-gray-800 px-1">{t("General Liability", "Responsabilidad general")}</legend>
            <div>
              <label className={labelCls}>{t("Insurance carrier", "Aseguradora")}</label>
              <input type="text" value={gl.glCarrier} onChange={(e) => setGl((g) => ({ ...g, glCarrier: e.target.value }))} className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>{t("Policy number", "Número de póliza")}</label>
              <input type="text" value={gl.glPolicyNumber} onChange={(e) => setGl((g) => ({ ...g, glPolicyNumber: e.target.value }))} className={fieldCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t("Each occurrence", "Por incidente")}</label>
                <input type="text" inputMode="decimal" placeholder="$" value={gl.glOccurrenceCents} onChange={(e) => setGl((g) => ({ ...g, glOccurrenceCents: e.target.value }))} className={fieldCls} />
              </div>
              <div>
                <label className={labelCls}>{t("Aggregate", "Total acumulado")}</label>
                <input type="text" inputMode="decimal" placeholder="$" value={gl.glAggregateCents} onChange={(e) => setGl((g) => ({ ...g, glAggregateCents: e.target.value }))} className={fieldCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>{t("Policy expiration date", "Fecha de vencimiento de la póliza")}</label>
              <input type="date" value={gl.glExpiresAt} onChange={(e) => setGl((g) => ({ ...g, glExpiresAt: e.target.value }))} className={fieldCls} />
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
            <legend className="text-sm font-semibold text-gray-800 px-1">{t("Workers’ Compensation", "Compensación de trabajadores")}</legend>

            <div>
              <label className={labelCls}>{t("Insurance carrier", "Aseguradora")}</label>
              <input
                type="text"
                value={workersCompCarrier}
                onChange={(e) => setWorkersCompCarrier(e.target.value)}
                placeholder={t("e.g. Travelers", "p. ej. Travelers")}
                className={fieldCls}
              />
            </div>

            <div>
              <label className={labelCls}>{t("Policy number", "Número de póliza")}</label>
              <input
                type="text"
                value={workersCompPolicyNumber}
                onChange={(e) => setWorkersCompPolicyNumber(e.target.value)}
                className={fieldCls}
              />
            </div>

            <div>
              <label className={labelCls}>{t("Policy expiration date", "Fecha de vencimiento de la póliza")}</label>
              <input
                type="date"
                value={workersCompExpiresAt}
                onChange={(e) => setWorkersCompExpiresAt(e.target.value)}
                className={fieldCls}
              />
            </div>

            <div>
              <label className={labelCls}>{t("Certificate of insurance (COI)", "Certificado de seguro (COI)")}</label>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                onChange={(e) => void onCoiFileChange(e)}
                disabled={uploadingCoi}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200"
              />
              {uploadingCoi && <p className="mt-1 text-xs text-gray-400">{t("Uploading…", "Subiendo…")}</p>}
              {!uploadingCoi && workersCompDocFilename && (
                <p className="mt-1 text-xs text-emerald-600">
                  {t("Uploaded", "Subido")}: {workersCompDocFilename}
                </p>
              )}
              {uploadError && <p className="mt-1 text-xs text-red-500">{uploadError}</p>}
            </div>
          </fieldset>

          {isLinkedToApplication ? (
            <p className="text-xs text-gray-400">
              {t(
                "We already have your company, insurance, and licensing details on file from your subcontractor application.",
                "Ya tenemos los datos de tu empresa, seguros y licencias de tu solicitud de subcontratista."
              )}
            </p>
          ) : (
            <>
              <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
                <legend className="text-sm font-semibold text-gray-800 px-1">{t("Additional Insurance", "Seguros adicionales")}</legend>
                {INSURANCE_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className={labelCls}>{fieldLabel(field, lang)}</label>
                    {questionnaireInput(field, questionnaireValues[subFieldName(field.key)] ?? "", (v) => setQuestionnaireField(field.key, v), lang)}
                  </div>
                ))}
              </fieldset>

              <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
                <legend className="text-sm font-semibold text-gray-800 px-1">{t("Company Profile", "Perfil de la empresa")}</legend>
                {COMPANY_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className={labelCls}>{fieldLabel(field, lang)}</label>
                    {questionnaireInput(field, questionnaireValues[subFieldName(field.key)] ?? "", (v) => setQuestionnaireField(field.key, v), lang)}
                  </div>
                ))}
              </fieldset>

              <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
                <legend className="text-sm font-semibold text-gray-800 px-1">{t("Licensing", "Licencias")}</legend>
                {LICENSING_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className={labelCls}>{fieldLabel(field, lang)}</label>
                    {questionnaireInput(field, questionnaireValues[subFieldName(field.key)] ?? "", (v) => setQuestionnaireField(field.key, v), lang)}
                  </div>
                ))}
              </fieldset>
            </>
          )}

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
