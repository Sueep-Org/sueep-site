import { prisma } from "@/lib/prisma";

/**
 * Decides the rate a labor log is saved with. Payroll pays every log at its
 * own rate, so a log saved at $0 for someone paid by the hour means those
 * hours go unpaid. That used to happen whenever the rate box was left
 * empty, since the form sends an empty box as 0.
 *
 * - Any rate above $0 is kept as entered (rates legitimately vary by job).
 * - Salaried, offshore and janitorial contract employees are paid outside
 *   hourly payroll, so $0 is fine for them.
 * - An hourly employee with no rate entered gets their profile rate.
 * - If there's no profile rate either, or the worker is a typed-in name
 *   with no rate, the log is rejected with a message saying what to fix.
 */
export async function resolveLaborRateCents(
  employeeId: string | null | undefined,
  requestedCents: number,
): Promise<{ ok: true; cents: number } | { ok: false; error: string }> {
  if (requestedCents > 0) return { ok: true, cents: requestedCents };

  if (!employeeId) {
    return { ok: false, error: "Enter an hourly rate for this worker." };
  }
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { firstName: true, lastName: true, payType: true, hourlyPayCents: true, isOffshore: true, isJanitorialContract: true },
  });
  if (!employee) return { ok: false, error: "Employee not found" };
  if (employee.payType === "SALARY" || employee.isOffshore || employee.isJanitorialContract) {
    return { ok: true, cents: 0 };
  }
  if (employee.hourlyPayCents && employee.hourlyPayCents > 0) {
    return { ok: true, cents: employee.hourlyPayCents };
  }
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  return {
    ok: false,
    error: `${name} has no hourly rate on their profile. Enter a rate here or add one to their employee profile.`,
  };
}
