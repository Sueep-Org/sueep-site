import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseOfferValues, readSections } from "@/lib/erp/offerLetters";
import { parseCommission } from "@/lib/erp/offerCommission";
import { OfferLetterBuilder } from "../OfferLetterBuilder";
import { loadOfferBuilder } from "../loadBuilder";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; letterId: string }> };

/** A saved offer letter: editable while it's a draft, view only after. */
export default async function OfferLetterPage({ params }: PageProps) {
  const { id, letterId } = await params;
  const { candidate, defaults, salaryHint } = await loadOfferBuilder(id);
  const letter = await prisma.offerLetter.findFirst({
    where: { id: letterId, candidateId: id },
    select: { id: true, status: true, values: true, sections: true, commission: true, sentAt: true, sentBy: true, signedAt: true, template: { select: { name: true, commissionDefaults: true } } },
  });
  if (!letter) notFound();

  return (
    <OfferLetterBuilder
      candidate={candidate}
      templates={[]}
      letter={{
        id: letter.id,
        status: letter.status,
        templateName: letter.template?.name ?? null,
        values: parseOfferValues(letter.values),
        sections: readSections(letter.sections),
        commission: parseCommission(letter.commission ?? letter.template?.commissionDefaults),
        sentAt: letter.sentAt?.toISOString() ?? null,
        sentBy: letter.sentBy,
        signedAt: letter.signedAt?.toISOString() ?? null,
      }}
      defaults={defaults}
      initialTemplateId={null}
      salaryHint={salaryHint}
    />
  );
}
