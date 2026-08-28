import { forwardRef } from "react";
import { inputClass, type FieldSize } from "./styles";

/**
 * Shared text input. See styles.ts for why this exists — replaces the
 * locally-redefined "input" className constant that most ERP form files
 * used to carry around individually.
 *
 * Named `variant` (not `size`) to avoid colliding with the native HTML
 * `size` attribute on <input> (a number, unrelated to this).
 */
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { variant?: FieldSize }>(
  function Input({ variant = "md", className = "", ...props }, ref) {
    return <input ref={ref} className={className ? `${inputClass[variant]} ${className}` : inputClass[variant]} {...props} />;
  },
);
