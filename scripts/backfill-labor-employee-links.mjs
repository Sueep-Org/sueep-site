import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function workerNameCandidates(name) {
  const normalized = normName(name);
  const out = new Set([normalized]);
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    out.add(`${parts[0]} ${parts[parts.length - 1]}`);
    out.add(parts[0]);
    out.add(parts[parts.length - 1]);
  }
  return [...out];
}

async function main() {
  const employees = await prisma.employee.findMany({
    select: { id: true, firstName: true, lastName: true },
  });
  const byName = new Map(
    employees.map((e) => [normName(`${e.firstName} ${e.lastName}`), e.id]),
  );

  const entries = await prisma.laborEntry.findMany({
    where: { employeeId: null },
    select: { id: true, workerName: true },
  });

  let linked = 0;
  for (const entry of entries) {
    const employeeId =
      workerNameCandidates(entry.workerName)
        .map((candidate) => byName.get(candidate))
        .find(Boolean) || null;
    if (!employeeId) continue;
    await prisma.laborEntry.update({
      where: { id: entry.id },
      data: { employeeId },
    });
    linked += 1;
  }

  console.log(
    JSON.stringify(
      {
        attempted: entries.length,
        linked,
        unresolved: entries.length - linked,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });