"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SITE_LINKS = [
  { label: "Home", href: "/" },
  { label: "Janitorial Requests", href: "/turnover-requests" },
  { label: "Commercial Cleaning", href: "/commercial-cleaning" },
  { label: "Careers", href: "/careers" },
] as const;

interface Props {
  cta?: { label: string; href: string };
}

export function MarketingNav({ cta }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 4); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Close mobile menu on pathname change
  useEffect(() => { setOpen(false); }, [pathname]);

  const ctaHref = cta?.href ?? "/#contact";
  const ctaLabel = cta?.label ?? "Request a Quote";

  return (
    <header
      className={`sticky top-0 z-50 bg-white transition-shadow duration-150 ${
        scrolled ? "shadow-md" : "border-b border-gray-100"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="shrink-0">
          <img src="/sueeplogo.png" alt="Sueep" className="h-10 w-auto" />
        </Link>

        {/* Desktop links */}
        <nav className="hidden items-center gap-1 md:flex">
          {SITE_LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-pink-50 text-[#E73C6E]"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden shrink-0 md:block">
          <a
            href={ctaHref}
            className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {ctaLabel}
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 md:hidden"
        >
          {open ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="absolute inset-x-0 top-16 z-50 border-t border-gray-100 bg-white shadow-lg md:hidden">
          <nav className="flex flex-col px-4 py-3 gap-0.5">
            {SITE_LINKS.map((link) => {
              const active = link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-3 text-sm font-medium ${
                    active
                      ? "bg-pink-50 text-[#E73C6E]"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-gray-100 px-4 py-3">
            <a
              href={ctaHref}
              className="block rounded-md bg-[#E73C6E] px-4 py-3 text-center text-sm font-semibold text-white"
            >
              {ctaLabel}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
