"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/erp/language";

const LANG_STORAGE_KEY = "sueep-sub-lang";

/** A choice made with the toggle on this phone wins, then the language on their profile. */
export function useSubLang(profileLang: Lang): [Lang, (next: Lang) => void] {
  const [lang, setLang] = useState<Lang>(profileLang);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "en" || saved === "es") setLang(saved);
    } catch {
      // storage blocked, keep the profile language
    }
  }, []);

  function change(next: Lang) {
    setLang(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // storage blocked, the choice just won't be remembered
    }
  }

  return [lang, change];
}

export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (next: Lang) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-gray-300 bg-white text-sm font-semibold" role="group" aria-label="Language">
      {(["en", "es"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={lang === l}
          className={`px-3 py-1.5 ${lang === l ? "bg-[#E73C6E] text-white" : "text-gray-600"}`}
        >
          {l === "en" ? "English" : "Español"}
        </button>
      ))}
    </div>
  );
}
