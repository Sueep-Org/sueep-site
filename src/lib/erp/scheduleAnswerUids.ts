/**
 * The invite uids for each kind of schedule assignment (same strings as
 * scheduleInvites.ts), so the schedule can look up each person's Confirm or
 * Can't make it answer. Safe on the server and the client.
 */
export type AnswerStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELLED";
export type Answers = Record<string, AnswerStatus>;

export const answerUid = {
  day: (id: string) => `day-assignment-${id}@sueep.com`,
  daySub: (id: string, contractorId: string) => `day-assignment-${id}-sub-${contractorId}@sueep.com`,
  worker: (id: string) => `worker-assignment-${id}@sueep.com`,
  coDay: (id: string) => `co-day-assignment-${id}@sueep.com`,
  coDaySub: (id: string, contractorId: string) => `co-day-assignment-${id}-sub-${contractorId}@sueep.com`,
  coWorker: (id: string) => `co-worker-assignment-${id}@sueep.com`,
};
