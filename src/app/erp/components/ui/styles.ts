/**
 * Central style tokens for ERP form controls.
 *
 * Before this file, "input"/"label" className strings were redefined locally
 * in 50+ component files (copy-pasted, not shared) — and they'd already
 * drifted: a few components ended up with a dark zinc theme while everything
 * else on the same page is light gray/white. Import from here instead of
 * redeclaring the strings, so a future tweak (color, radius, focus ring)
 * only has to happen in one place.
 *
 * Prefer the <Input>/<Label>/<Button> components in this folder for plain
 * <input>/<label>/<button> elements. Use these raw class strings only for
 * elements those components don't cover — <select>, <textarea>, or a
 * non-<label> element that needs the same look.
 */

export type FieldSize = "xs" | "sm" | "md";

/**
 * md — the default, paired with a <Label> above it (has its own top margin).
 * sm — inline table-row editing (e.g. an editable cell), no top margin.
 * xs — compact filter/toolbar inputs, no top margin.
 */
export const inputClass: Record<FieldSize, string> = {
  md: "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500",
  sm: "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500",
  xs: "rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500",
};

export type LabelSize = "default" | "compact";

export const labelClass: Record<LabelSize, string> = {
  default: "block text-xs font-medium text-gray-600",
  compact: "block text-[11px] font-medium text-gray-500",
};
