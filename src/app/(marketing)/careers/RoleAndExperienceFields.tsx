"use client";

import { useState } from "react";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

export function RoleAndExperienceFields({
  defaultCleaner,
  defaultPainter,
  defaultSupervisor,
}: {
  defaultCleaner: boolean;
  defaultPainter: boolean;
  defaultSupervisor: boolean;
}) {
  const [cleaner, setCleaner] = useState(defaultCleaner);
  const [painter, setPainter] = useState(defaultPainter);
  const [supervisor, setSupervisor] = useState(defaultSupervisor);

  // Supervisors oversee both cleaning and painting crews, so they answer the
  // same cleaning + painting experience questions as those roles, same as
  // if they'd checked both boxes, even if they only checked Supervisor.
  const showCleaning = cleaner || supervisor;
  const showPainting = painter || supervisor;

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
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              name="roles"
              value="supervisor"
              checked={supervisor}
              onChange={(e) => setSupervisor(e.target.checked)}
              className="accent-[#E73C6E]"
            />
            Supervisor
          </label>
        </div>
        {!cleaner && !painter && !supervisor && (
          <p className="mt-1 text-xs text-red-500">Select at least one position.</p>
        )}
      </div>

      {showCleaning && (
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

      {showPainting && (
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

      {supervisor && (
        <div>
          <label htmlFor="supervisingYears" className={labelClass}>
            How many years of supervising experience do you have? <span className="text-red-500">*</span>
          </label>
          <input
            id="supervisingYears"
            name="supervisingYears"
            type="number"
            min="0"
            max="99"
            required
            className={inputClass}
            placeholder="e.g. 3"
          />

          <label className={`${labelClass} mt-3`}>
            Do you speak English? <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-6 mt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="speaksEnglish" value="yes" required className="accent-[#E73C6E]" />
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="speaksEnglish" value="no" required className="accent-[#E73C6E]" />
              No
            </label>
          </div>

          <label className={`${labelClass} mt-3`}>
            Do you speak Spanish? <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-6 mt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="speaksSpanish" value="yes" required className="accent-[#E73C6E]" />
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="speaksSpanish" value="no" required className="accent-[#E73C6E]" />
              No
            </label>
          </div>
        </div>
      )}
    </>
  );
}
