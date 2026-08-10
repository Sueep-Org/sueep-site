"use client";

import { useState } from "react";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

export function RoleAndExperienceFields({
  defaultCleaner,
  defaultPainter,
}: {
  defaultCleaner: boolean;
  defaultPainter: boolean;
}) {
  const [cleaner, setCleaner] = useState(defaultCleaner);
  const [painter, setPainter] = useState(defaultPainter);

  return (
    <>
      <div>
        <label className={labelClass}>
          Which position(s) are you applying for? <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-6 mt-1">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              name="roles"
              value="cleaner"
              checked={cleaner}
              onChange={(e) => setCleaner(e.target.checked)}
              className="accent-[#E73C6E]"
            />
            Cleaner
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              name="roles"
              value="painter"
              checked={painter}
              onChange={(e) => setPainter(e.target.checked)}
              className="accent-[#E73C6E]"
            />
            Painter
          </label>
        </div>
        {!cleaner && !painter && (
          <p className="mt-1 text-xs text-red-500">Select at least one position.</p>
        )}
      </div>

      {cleaner && (
        <div>
          <label className={labelClass}>
            Do you have cleaning experience? <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-6 mt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="cleaningExperience" value="yes" required className="accent-[#E73C6E]" />
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="cleaningExperience" value="no" required className="accent-[#E73C6E]" />
              No
            </label>
          </div>
          <label htmlFor="cleaningYears" className={`${labelClass} mt-3`}>
            If yes, how many years of cleaning experience?
          </label>
          <input
            id="cleaningYears"
            name="cleaningYears"
            type="number"
            min="0"
            max="99"
            className={inputClass}
            placeholder="e.g. 3"
          />
        </div>
      )}

      {painter && (
        <div>
          <label className={labelClass}>
            Do you have painting experience? <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-6 mt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="paintingExperience" value="yes" required className="accent-[#E73C6E]" />
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="paintingExperience" value="no" required className="accent-[#E73C6E]" />
              No
            </label>
          </div>
          <label htmlFor="paintingYears" className={`${labelClass} mt-3`}>
            If yes, how many years of painting experience?
          </label>
          <input
            id="paintingYears"
            name="paintingYears"
            type="number"
            min="0"
            max="99"
            className={inputClass}
            placeholder="e.g. 3"
          />
        </div>
      )}
    </>
  );
}
