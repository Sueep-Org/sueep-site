import { forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "xs" | "sm" | "md";

/**
 * Shared button. A grep across the ERP found 50+ near-duplicate
 * "bg-pink-600 px-... text-... hover:bg-pink-500" strings for what's
 * supposed to be the same primary button, differing in padding, hover
 * shade, and disabled opacity in ways that don't look intentional. This
 * consolidates the majority convention into one place.
 *
 * `ghost` is the text-only link style used for row actions like
 * Edit/Delete/Cancel — no border, background, or padding, just color.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-pink-600 text-white hover:bg-pink-500 disabled:opacity-50",
  secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
  ghost: "text-gray-500 hover:text-gray-700 disabled:opacity-50",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "px-3 py-1.5 text-xs font-medium",
  sm: "px-3 py-1.5 text-sm font-medium",
  md: "px-4 py-2 text-sm font-medium",
};

const GHOST_SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-sm",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button({ variant = "primary", size = "md", type = "button", className = "", ...props }, ref) {
  const shape = variant === "ghost" ? "" : "rounded-md";
  const sizing = variant === "ghost" ? GHOST_SIZE_CLASSES[size] : SIZE_CLASSES[size];
  const classes = [shape, sizing, VARIANT_CLASSES[variant], className].filter(Boolean).join(" ");
  return <button ref={ref} type={type} className={classes} {...props} />;
});
