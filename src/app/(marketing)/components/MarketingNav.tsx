"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type NavLink = {
  label: string;
  href: string;
  /** true = plain anchor on the same page (scrolls), false/undefined = Next Link */
  anchor?: boolean;
  subtle?: boolean;
};

type Props = {
  links: NavLink[];
  /** CTA button shown on desktop and in mobile menu */
  cta?: { label: string; href: string };
};

export function MarketingNav({ links, cta }: Props) {
  const [open, setOpen] = useState(false);

  // Close on route change (escape key or resize back to desktop)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close drawer when viewport grows past md breakpoint
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function NavItem({ link, mobile }: { link: NavLink; mobile?: boolean }) {
    const cls = mobile
      ? `block w-full px-4 py-3 text-left text-sm font-medium border-b border-gray-100 last:border-0 ${link.subtle ? "text-gray-500" : "text-gray-800"} hover:text-[#E73C6E] hover:bg-gray-50`
      : `text-sm font-medium ${link.subtle ? "text-gray-500 font-normal text-xs" : ""} hover:text-[#E73C6E]`;

    if (link.anchor) {
      return (
        <a href={link.href} className={cls} onClick={() => setOpen(false)}>
          {link.label}
        </a>
      );
    }
    return (
      <Link href={link.href} className={cls} onClick={() => setOpen(false)}>
        {link.label}
      </Link>
    );
  }

  return (
    <header className="sticky top-0 bg-white border-b border-gray-200 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <img src="/sueeplogo.png" alt="Sueep logo" className="h-12 w-auto" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <NavItem key={link.href} link={link} />
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:block shrink-0">
          {cta && (
            <a
              href={cta.href}
              className="px-4 py-2 bg-[#E73C6E] text-white rounded-md text-sm font-medium hover:opacity-90"
            >
              {cta.label}
            </a>
          )}
        </div>

        {/* Mobile: CTA + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          {cta && (
            <a
              href={cta.href}
              className="px-3 py-1.5 bg-[#E73C6E] text-white rounded-md text-xs font-medium hover:opacity-90 whitespace-nowrap"
            >
              {cta.label}
            </a>
          )}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-md text-gray-600 hover:text-[#E73C6E] hover:bg-gray-100 transition-colors"
          >
            {open ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white shadow-lg">
          {links.map((link) => (
            <NavItem key={link.href} link={link} mobile />
          ))}
        </div>
      )}
    </header>
  );
}
