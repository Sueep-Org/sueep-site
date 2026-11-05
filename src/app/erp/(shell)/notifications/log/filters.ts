/** Email Log filters, read from and written to the URL. Plain data, so the page and LogFilters share it. */

export type LogFilterValues = {
  type: string;
  status: string;
  /** Subject search */
  q: string;
  /** Part of a recipient's email, matched across To, Cc and Bcc */
  to: string;
  /** "YYYY-MM-DD" Eastern, both ends included */
  from: string;
  until: string;
  /** ERP page the email is about, e.g. /erp/projects/abc */
  about: string;
  /** "1" when on */
  attach: string;
  resent: string;
};

export const FILTER_KEYS = ["type", "status", "q", "to", "from", "until", "about", "attach", "resent"] as const;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function readLogFilters(params: Record<string, string | undefined>): LogFilterValues {
  const text = (k: string) => (params[k] ?? "").trim();
  const date = (k: string) => (DATE_KEY.test(text(k)) ? text(k) : "");
  const about = text("about");
  return {
    type: text("type"),
    status: text("status"),
    q: text("q"),
    to: text("to"),
    from: date("from"),
    until: date("until"),
    about: /^\/erp\/(projects|buildings)\/[\w-]+$/.test(about) ? about : "",
    attach: text("attach") === "1" ? "1" : "",
    resent: text("resent") === "1" ? "1" : "",
  };
}

export function logHref(f: Partial<LogFilterValues>, page = 1): string {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = f[k]?.trim();
    if (v) p.set(k, v);
  }
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/erp/notifications/log${s ? `?${s}` : ""}`;
}

export function hasAnyFilter(f: LogFilterValues): boolean {
  return FILTER_KEYS.some((k) => f[k] !== "");
}
