"use client";

import type { FormEvent } from "react";
import { PAINTING_LEAD_STORAGE_KEY, type StoredPaintingLead } from "@/lib/paintingLeadStorage";

const inputClass =
  "w-full rounded-md px-4 py-3 text-base bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/50 focus:border-[#E73C6E]";

export default function PaintingLeadForm() {
  const phoneHref = "tel:+12675811228";

  const persistLead = (e: FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const fd = new FormData(form);
    const lead: StoredPaintingLead = {
      name: String(fd.get("name") || "").trim(),
      email: String(fd.get("_replyto") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      zip: String(fd.get("zip") || "").trim(),
      serviceType: String(fd.get("serviceType") || "").trim(),
      message: String(fd.get("message") || "").trim(),
    };
    try {
      sessionStorage.setItem(PAINTING_LEAD_STORAGE_KEY, JSON.stringify(lead));
    } catch {
      // ignore quota / private mode
    }
  };

  return (
    <div id="estimate-form">
      <h2 id="lead-heading" className="text-2xl md:text-3xl font-bold uppercase">
        Request a Painting Estimate
      </h2>
      <p className="mt-2 text-gray-600">Tell us about your project and we&apos;ll respond quickly.</p>
      <form
        className="mt-6 grid grid-cols-1 gap-4"
        method="post"
        action="/api/contact"
        autoComplete="on"
        onSubmit={persistLead}
      >
        <input type="hidden" name="_service" value="painting" />
        <input type="text" name="_honey" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <input type="hidden" name="_subject" value="New residential painting inquiry from sueep.com" />
        <input type="hidden" name="_captcha" value="false" />
        <input type="hidden" name="_template" value="table" />
        <input name="name" type="text" placeholder="Full Name" className={inputClass} required />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="_replyto"
            type="email"
            placeholder="you@example.com *"
            className={inputClass}
            required
          />
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            pattern="^\\+?[0-9\\s\\-()]{7,}$"
            placeholder="(555) 555-5555 *"
            className={inputClass}
            required
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="zip"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{5}"
            minLength={5}
            maxLength={5}
            title="Please enter a 5-digit ZIP code"
            placeholder="ZIP Code"
            className={inputClass}
            required
          />
          <select
            name="serviceType"
            className={inputClass}
            defaultValue=""
            required
          >
            <option value="" disabled>
              Service Type
            </option>
            <option>Interior Painting</option>
            <option>Exterior Painting</option>
            <option>Trim & Doors</option>
            <option>Other</option>
          </select>
        </div>
        <textarea
          name="message"
          placeholder="Rooms, colors, timing, any details we should know"
          rows={5}
          className={inputClass}
          required
        />
        <button type="submit" className="px-6 py-3 bg-[#E73C6E] text-white font-medium rounded-md hover:opacity-90">
          Submit Request
        </button>
        <p className="mt-2 text-xs text-gray-500">
          Prefer predictable costs? Ask about monthly payment options for your painting project.
        </p>
        <p className="text-sm text-gray-600">
          Prefer to talk? Call{" "}
          <a href={phoneHref} className="font-semibold underline decoration-transparent hover:decoration-inherit">
            267-581-1228
          </a>
        </p>
      </form>
    </div>
  );
}
