import { labelClass, type LabelSize } from "./styles";

/** Shared field label. See styles.ts. */
export function Label({
  variant = "default",
  className = "",
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { variant?: LabelSize }) {
  return <label className={className ? `${labelClass[variant]} ${className}` : labelClass[variant]} {...props} />;
}
