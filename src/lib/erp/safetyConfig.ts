// Change SAFETY_ESCALATION_EMAIL env var to update the escalation recipient after testing.
export const SAFETY_ESCALATION_EMAIL = process.env.SAFETY_ESCALATION_EMAIL ?? "emma@sueep.com";

// Number of violations before a worker is escalated to Operations Management.
export const SAFETY_VIOLATION_THRESHOLD = 3;
