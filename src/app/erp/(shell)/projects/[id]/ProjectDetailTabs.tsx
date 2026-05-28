"use client";

import { useState } from "react";

type Tab = {
  label: string;
  content: React.ReactNode;
};

type Props = {
  tabs: Tab[];
};

export function ProjectDetailTabs({ tabs }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 mb-6">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActiveIndex(i)}
            className={
              i === activeIndex
                ? "rounded-full bg-[#E73C6E] px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full px-4 py-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{tabs[activeIndex]?.content}</div>
    </div>
  );
}
