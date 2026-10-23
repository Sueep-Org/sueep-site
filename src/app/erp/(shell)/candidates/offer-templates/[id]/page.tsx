import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canEditOfferTemplates, canSeeOfficeHiring, getErpAuth } from "@/lib/erpAuth";
import { readSections } from "@/lib/erp/offerLetters";
import { parseCommission } from "@/lib/erp/offerCommission";
import { OfferTemplateEditor } from "./OfferTemplateEditor";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function OfferTemplatePage({ params }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canSeeOfficeHiring(auth.role)) notFound();
  const { id } = await params;

  const t = await prisma.offerLetterTemplate.findUnique({
    where: { id },
    include: { _count: { select: { letters: true } } },
  });
  if (!t) notFound();

  return (
    <div className="space-y-4">
      <Link href="/erp/candidates/offer-templates" className="text-xs text-pink-600 hover:underline">
        ← Offer templates
      </Link>
      <OfferTemplateEditor
        canEdit={canEditOfferTemplates(auth.role)}
        template={{
          id: t.id,
          name: t.name,
          description: t.description,
          signerName: t.signerName,
          signerTitle: t.signerTitle,
          archived: t.archived,
          sections: readSections(t.sections),
          commissionDefaults: parseCommission(t.commissionDefaults),
          letterCount: t._count.letters,
        }}
      />
    </div>
  );
}
