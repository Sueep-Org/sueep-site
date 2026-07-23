import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SupervisorProjectScope = {
  /** Prisma where clause matching only this supervisor's projects. Null when
   * the supervisor isn't linked to any ErpUser/Employee record, in which
   * case there's nothing to scope by (see `unlinked`). */
  where: Prisma.ProjectWhereInput | null;
  /** True when the logged-in supervisor couldn't be resolved to an ErpUser
   * or Employee record at all. */
  unlinked: boolean;
};

/** "My projects" for a SUPERVISOR: assigned to (project-level or a specific
 * scheduled day) or personally logged labor on. Same rule the dashboard and
 * schedule calendar use for what a supervisor can see. */
export async function getSupervisorProjectScope(uid: string, email: string): Promise<SupervisorProjectScope> {
  // uid is the Firebase UID from the session token, not the ErpUser.id that
  // Project.supervisorUserId actually references, so it has to be resolved first.
  const [supervisorUser, supervisorEmployee] = await Promise.all([
    prisma.erpUser.findUnique({ where: { firebaseUid: uid }, select: { id: true } }),
    prisma.employee.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  const supervisorFullName = supervisorEmployee
    ? `${supervisorEmployee.firstName} ${supervisorEmployee.lastName}`.trim()
    : null;

  const assignmentOr: Prisma.ProjectWhereInput[] = [];
  if (supervisorUser) {
    assignmentOr.push({ supervisorUserId: supervisorUser.id });
    assignmentOr.push({ dayAssignments: { some: { supervisorUserId: supervisorUser.id } } });
  }
  if (supervisorEmployee) {
    assignmentOr.push({ laborEntries: { some: { employeeId: supervisorEmployee.id } } });
  }
  if (supervisorFullName) {
    assignmentOr.push({ laborEntries: { some: { workerName: { equals: supervisorFullName, mode: "insensitive" } } } });
  }

  return {
    where: assignmentOr.length > 0 ? { OR: assignmentOr } : null,
    unlinked: assignmentOr.length === 0,
  };
}
