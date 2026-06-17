"use client";

import { useEffect, useState } from "react";

export default function ContactForm() {
  const [mounted, setMounted] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState(() =>
    typeof window !== "undefined"
      ? `${window.location.origin}/thank-you`
      : "/thank-you"
  );
  const [errors, setErrors] = useState<{ email?: string; phone?: string }>({});
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setRedirectUrl(`${window.location.origin}/thank-you`);
    }
  }, []);
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const emailInput = form.querySelector('input[name="_replyto"]') as HTMLInputElement | null;
    const phoneInput = form.querySelector('input[name="phone"]') as HTMLInputElement | null;
    const nextErrors: { email?: string; phone?: string } = {};
    const email = (emailInput?.value || "").trim();
    const phone = (phoneInput?.value || "").trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const phoneOk = /^\+?[0-9\s\-()]{7,}$/.test(phone);
    if (!emailOk) nextErrors.email = "Please enter a valid email address.";
    if (!phoneOk) nextErrors.phone = "Please enter a valid phone number.";
    if (nextErrors.email || nextErrors.phone) {
      e.preventDefault();
      setErrors(nextErrors);
    } else {
      setErrors({});
    }
  }
  if (!mounted) return null;
  return (
    <div suppressHydrationWarning>
      <h2 className="text-2xl md:text-3xl font-bold uppercase">Contact Us</h2>
      <form
        className="mt-6 space-y-4"
        method="post"
        action="https://formsubmit.co/fc9c50165f29e01095f6f39726348f26"
        autoComplete="off"
        onSubmit={handleSubmit}
      >
        <input type="hidden" name="_next" value={redirectUrl} />
        {/* Honeypot */}
        <input type="text" name="_honey" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
        <input type="hidden" name="_subject" value="New website inquiry from sueep.com" />
        <input name="name" type="text" placeholder="Full Name" className="w-full rounded-md px-4 py-3 text-base bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/50 focus:border-[#E73C6E]" required />
        <div>
          <label htmlFor="email" className="sr-only">Email</label>
          <input
            id="email"
            name="_replyto"
            type="email"
            placeholder="you@company.com *"
            className="mt-1 w-full rounded-md px-4 py-3 text-base bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/50 focus:border-[#E73C6E]"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            required
            onInput={() => setErrors((prev) => ({ ...prev, email: undefined }))}
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-sm text-red-600">{errors.email}</p>
          )}
        </div>
        <div>
          <label htmlFor="phone" className="sr-only">Phone</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            pattern="^\\+?[0-9\\s\\-()]{7,}$"
            placeholder="(555) 555-5555 *"
            className="mt-1 w-full rounded-md px-4 py-3 text-base bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/50 focus:border-[#E73C6E]"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "phone-error" : undefined}
            required
            onInput={() => setErrors((prev) => ({ ...prev, phone: undefined }))}
          />
          {errors.phone && (
            <p id="phone-error" className="mt-1 text-sm text-red-600">{errors.phone}</p>
          )}
        </div>
        <div className="flex items-start gap-3">
          <input
            id="sms-consent"
            name="sms_consent"
            type="checkbox"
            required
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#E73C6E] focus:ring-[#E73C6E]/50 cursor-pointer"
          />
          <label htmlFor="sms-consent" className="text-xs text-gray-500 leading-relaxed">
            By checking this box, I consent to receive SMS from Sueep LLC related to Marketing and General follow-up SMS. Reply STOP to opt-out; Reply HELP for support; Message &amp; data rates may apply; Messaging frequency may vary. Visit{" "}
            <a href="https://sueep.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700">https://sueep.com/privacy</a>{" "}
            to see our privacy policy.
          </label>
        </div>
        <input name="company" type="text" placeholder="Company / Property" className="w-full rounded-md px-4 py-3 text-base bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/50 focus:border-[#E73C6E]" />
        <textarea name="message" placeholder="Scope, timelines, requirements" rows={5} className="w-full rounded-md px-4 py-3 text-base bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/50 focus:border-[#E73C6E]" required></textarea>
        <button type="submit" className="px-6 py-3 bg-[#E73C6E] text-white font-medium rounded-md hover:opacity-90">Send</button>
      </form>
    </div>
  );
}


