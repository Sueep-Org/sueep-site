'use client'

import React, { useEffect, useMemo, useRef, useState } from "react";

type Partner = {
  logo: string;
  name: string;
  url?: string;
  scale?: number;
};

type PartnersCarouselProps = {
  partners: Partner[];
  intervalMs?: number;
};

export default function PartnersCarousel({ partners, intervalMs = 4000 }: PartnersCarouselProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const safePartners = useMemo(() => partners.filter(Boolean), [partners]);

  useEffect(() => {
    if (!containerRef.current || safePartners.length === 0 || paused) return;
    const id = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % safePartners.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, safePartners.length, paused]);

  useEffect(() => {
    const el = containerRef.current;
    const target = itemRefs.current[activeIndex];
    if (!el || !target) return;
    el.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
  }, [activeIndex]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        aria-label="Companies we service"
      >
        <div className="flex gap-10 items-stretch px-2">
          {safePartners.map((partner, idx) => (
            <div
              key={partner.name}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              className="snap-center shrink-0"
            >
              <div className="text-center flex flex-col">
                {partner.url ? (
                  <a href={partner.url} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="mx-auto w-full max-w-[22rem] md:max-w-[26rem] lg:max-w-[30rem] h-40 md:h-48 lg:h-56 flex items-center justify-center overflow-hidden">
                      <img
                        src={partner.logo}
                        alt={partner.name}
                        className="max-h-full w-auto object-contain"
                        style={{ transform: `scale(${partner.scale ?? 1})` }}
                      />
                    </div>
                  </a>
                ) : (
                  <div className="mx-auto w-full max-w-[22rem] md:max-w-[26rem] lg:max-w-[30rem] h-40 md:h-48 lg:h-56 flex items-center justify-center overflow-hidden">
                    <img
                      src={partner.logo}
                      alt={partner.name}
                      className="max-h-full w-auto object-contain"
                      style={{ transform: `scale(${partner.scale ?? 1})` }}
                    />
                  </div>
                )}
                <p className="mt-2 text-sm text-gray-600">{partner.name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {Array.from({ length: Math.min(3, safePartners.length) }).map((_, i) => {
          const activeDot = activeIndex % Math.min(3, safePartners.length || 1);
          return (
            <span
              key={i}
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${i === activeDot ? "bg-[#E73C6E]" : "bg-gray-300"}`}
            />
          );
        })}
      </div>
    </div>
  );
}


