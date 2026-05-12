import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseHourlyPayFromNotes(notes) {
  if (!notes) return null;
  const m = notes.match(/Hourly Pay:\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parseProjectFromNotes(notes) {
  if (!notes) return null;
  const m = notes.match(/Project:\s*([^|]+)/i);
  if (!m) return null;
  const v = String(m[1]).trim();
  return v || null;
}

async function main() {
  const employees = await prisma.employee.findMany({
    select: { id: true, notes: true, hourlyPayCents: true, defaultProject: true },
  });

  let updated = 0;
  for (const e of employees) {
    const hourlyPayCents = e.hourlyPayCents ?? parseHourlyPayFromNotes(e.notes);
    const defaultProject = e.defaultProject ?? parseProjectFromNotes(e.notes);
    if (hourlyPayCents === e.hourlyPayCents && defaultProject === e.defaultProject) continue;

    await prisma.employee.update({
      where: { id: e.id },
      data: {
        hourlyPayCents: hourlyPayCents ?? undefined,
        defaultProject: defaultProject ?? undefined,
      },
    });
    updated += 1;
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });