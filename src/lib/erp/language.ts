/**
 * Email and page language for employees and contractors (Employee.language,
 * Contractor.language). Only fixed wording is translated; anything staff type
 * (job titles, notes, scope) goes out as typed. Safe to import on the client.
 */
export type Lang = "en" | "es";

export const LANGUAGE_OPTIONS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish (Español)" },
];

export function parseLang(v: unknown): Lang {
  return v === "es" ? "es" : "en";
}

/** The text for `lang`, e.g. tr(lang, { en: "Confirm", es: "Confirmar" }). */
export function tr(lang: Lang, text: { en: string; es: string }): string {
  return lang === "es" ? text.es : text.en;
}

/** Locale for dates and times, e.g. "martes, 27 de octubre" in Spanish. */
export function dateLocale(lang: Lang): string {
  return lang === "es" ? "es-US" : "en-US";
}
