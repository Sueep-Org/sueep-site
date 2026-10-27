import { isLienManualStepKey, parseLienDecision, parseLienManualSteps, parseLienRole, parseLienState } from "./lienDeadline";

/** The lien columns a Project or a Building holds, as the save reads them. */
type LienExisting = { lienDecision: string | null; lienDecisionNote: string | null; lienSteps: unknown };

/**
 * The lien fields from a PATCH body, as column updates. Shared by the
 * project and building routes so both save the same way. Who and when are
 * stamped from `email` for a decision change or a ticked step.
 */
export function lienPatchData(body: Record<string, unknown>, existing: LienExisting, email: string | null): { data: Record<string, unknown> } | { error: string } {
  const data: Record<string, unknown> = {};
  if (body.lienState !== undefined) data.lienState = parseLienState(body.lienState);
  if (body.lienRole !== undefined) data.lienRole = parseLienRole(body.lienRole);
  if (body.lienResidential !== undefined) data.lienResidential = body.lienResidential === true;
  if (body.lienDecision !== undefined || body.lienDecisionNote !== undefined) {
    const decision = body.lienDecision !== undefined ? parseLienDecision(body.lienDecision) : parseLienDecision(existing.lienDecision);
    const note = body.lienDecisionNote !== undefined ? String(body.lienDecisionNote ?? "").trim() || null : existing.lienDecisionNote;
    data.lienDecision = decision;
    data.lienDecisionNote = decision ? note : null;
    // Who and when follow the decision itself, not a later edit to its note.
    if (decision !== parseLienDecision(existing.lienDecision)) {
      data.lienDecisionAt = decision ? new Date() : null;
      data.lienDecisionBy = decision ? email : null;
    }
  }
  for (const field of ["lienOwnerName", "lienOwnerAddress", "lienGcName", "lienGcAddress", "lienNoticeTracking"] as const) {
    if (body[field] !== undefined) data[field] = String(body[field] ?? "").trim() || null;
  }
  // Ticking or unticking one lien step: { key, done }. Who and when are stamped here.
  if (body.lienStep && typeof body.lienStep === "object") {
    const step = body.lienStep as { key?: unknown; done?: unknown };
    if (!isLienManualStepKey(step.key)) return { error: "Unknown lien step" };
    const steps = parseLienManualSteps(existing.lienSteps);
    if (step.done === true) steps[step.key] = { at: new Date().toISOString(), by: email };
    else delete steps[step.key];
    data.lienSteps = steps;
  }
  if (body.lienNoticeSentOn !== undefined) {
    const d = body.lienNoticeSentOn ? new Date(String(body.lienNoticeSentOn)) : null;
    data.lienNoticeSentOn = d && !isNaN(d.getTime()) ? d : null;
  }
  return { data };
}
