export type ProjectLifecycle = "UPCOMING" | "ACTIVE" | "COMPLETED";

export function deriveProjectLifecycle(status: string, projectDateIso: string | null): ProjectLifecycle {
  const s = status.toUpperCase();
  if (s === "COMPLETE" || s === "ARCHIVED") return "COMPLETED";
  if (projectDateIso) {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const d = new Date(projectDateIso);
    if (Number.isFinite(d.getTime()) && d.getTime() > startOfToday.getTime()) return "UPCOMING";
  }
  return "ACTIVE";
}