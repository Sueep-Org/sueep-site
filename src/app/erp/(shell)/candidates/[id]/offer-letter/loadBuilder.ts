import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canSeeOfficeHiring, getErpAuth } from "@/lib/erpAuth";
import { formatSalaryRange } from "@/lib/erp/officeHiring";
import { defaultOfferValues, readSections } from "@/lib/erp/offerLetters";
import { parseCommission } from "@/lib/erp/offerCommission";

/** What both offer letter pages need: the office candidate, starting values and the salary hint. */
export async function loadOfferBuilder(candidateId: string) {
  const auth = await getErpAuth();
  if (!auth || !canSeeOfficeHiring(auth.role)) notFound();

  const candidate = await prisma.candidateApplication.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      fullName: true,
      email: true,
      track: true,
      expectedSalary: true,
      jobOpening: { select: { title: true, workMode: true, salaryMinCents: true, salaryMaxCents: true } },
    },
  });
  if (!candidate || candidate.track !== "OFFICE") notFound();

  const range = candidate.jobOpening ? formatSalaryRange(candidate.jobOpening.salaryMinCents, candidate.jobOpening.salaryMaxCents) : "";
  const salaryHint = [range ? `Opening: ${range}` : null, candidate.expectedSalary ? `Expects: ${candidate.expectedSalary}` : null]
    .filter(Boolean)
    .join(". ");

  return {
    candidate: { id: candidate.id, fullName: candidate.fullName, email: candidate.email },
    defaults: defaultOfferValues({ fullName: candidate.fullName, opening: candidate.jobOpening }),
    salaryHint: salaryHint || null,
  };
}

export async function loadActiveTemplates() {
  const rows = await prisma.offerLetterTemplate.findMany({
    where: { archived: false },
    select: { id: true, name: true, description: true, sections: true, commissionDefaults: true },
    orderBy: { name: "asc" },
  });
  return rows.map(({ commissionDefaults, ...t }) => ({ ...t, sections: readSections(t.sections), commission: parseCommission(commissionDefaults) }));
}
