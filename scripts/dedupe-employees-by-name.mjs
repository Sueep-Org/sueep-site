import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalized(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const all = await prisma.employee.findMany({
    include: { documents: true },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map();
  for (const e of all) {
    const key = normalized(`${e.firstName} ${e.lastName}`);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  let mergedGroups = 0;
  let deletedEmployees = 0;
  let docsMoved = 0;

  for (const list of groups.values()) {
    if (list.length < 2) continue;

    const primary = list.find((e) => e.email) || list[0];
    const others = list.filter((e) => e.id !== primary.id);

    let role = primary.role;
    let phone = primary.phone;
    let hireDate = primary.hireDate;
    let notes = primary.notes;

    for (const other of others) {
      if (!role && other.role) role = other.role;
      if (!phone && other.phone) phone = other.phone;
      if (!hireDate && other.hireDate) hireDate = other.hireDate;
      if ((!notes || notes.length < 20) && other.notes) notes = other.notes;
    }

    await prisma.employee.update({
      where: { id: primary.id },
      data: {
        role: role ?? undefined,
        phone: phone ?? undefined,
        hireDate: hireDate ?? undefined,
        notes: notes ?? undefined,
      },
    });

    const existingSigs = new Set(
      primary.documents.map((d) => `${d.documentType}|${d.title || ""}|${d.notes || ""}`),
    );

    for (const other of others) {
      for (const d of other.documents) {
        const sig = `${d.documentType}|${d.title || ""}|${d.notes || ""}`;
        if (existingSigs.has(sig)) continue;
        await prisma.employeeDocument.create({
          data: {
            employeeId: primary.id,
            documentType: d.documentType,
            title: d.title,
            issuedAt: d.issuedAt,
            expiresAt: d.expiresAt,
            isVerified: d.isVerified,
            fileUrl: d.fileUrl,
            notes: d.notes,
          },
        });
        existingSigs.add(sig);
        docsMoved += 1;
      }
      await prisma.employee.delete({ where: { id: other.id } });
      deletedEmployees += 1;
    }
    mergedGroups += 1;
  }

  console.log(
    JSON.stringify(
      {
        mergedGroups,
        deletedEmployees,
        docsMoved,
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