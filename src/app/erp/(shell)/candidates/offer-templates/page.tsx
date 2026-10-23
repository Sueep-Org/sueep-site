import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canEditOfferTemplates, canSeeOfficeHiring, getErpAuth } from "@/lib/erpAuth";
import { readSections } from "@/lib/erp/offerLetters";
import { InfoTip } from "@/app/erp/components/ui";
import { AddStartersButton, DuplicateTemplateButton, NewTemplateButton } from "./TemplateActions";
import { SignatureCard } from "./SignatureCard";
import { getOfferSignature } from "@/lib/erp/offerSignature";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ archived?: string }> };

export default async function OfferTemplatesPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canSeeOfficeHiring(auth.role)) notFound();
  const canEdit = canEditOfferTemplates(auth.role);
  const showArchived = (await searchParams).archived === "1";

  const [templates, total, signature] = await Promise.all([
    prisma.offerLetterTemplate.findMany({
      where: showArchived ? {} : { archived: false },
      select: {
        id: true,
        name: true,
        description: true,
        sections: true,
        archived: true,
        updatedAt: true,
        updatedBy: true,
        _count: { select: { letters: true } },
      },
      orderBy: [{ archived: "asc" }, { name: "asc" }],
    }),
    prisma.offerLetterTemplate.count(),
    getOfferSignature(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/erp/candidates?track=office" className="text-xs text-pink-600 hover:underline">
            ← Office openings
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-gray-900">
            Offer templates
            <InfoTip text="Wording for offer letters. Blanks like {firstName} fill in from the candidate and opening when a letter is made. Admin and Business Manager can edit." />
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={showArchived ? "/erp/candidates/offer-templates" : "/erp/candidates/offer-templates?archived=1"}
            className="text-xs text-pink-600 hover:underline"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
          {canEdit && total === 0 ? <AddStartersButton /> : null}
          {canEdit ? <NewTemplateButton /> : null}
        </div>
      </div>

      <SignatureCard
        canEdit={canEdit}
        saved={signature ? { name: signature.name, updatedAt: signature.updatedAt, updatedBy: signature.updatedBy } : null}
      />

      {templates.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          {total === 0 && canEdit
            ? "No templates yet. Add the starter templates (Standard and With commission) to begin."
            : "No templates yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-4 py-2 font-semibold">Template</th>
                <th className="px-4 py-2 font-semibold">Sections</th>
                <th className="px-4 py-2 font-semibold">Letters</th>
                <th className="px-4 py-2 font-semibold">Updated</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t, i) => {
                const sections = readSections(t.sections);
                const on = sections.filter((s) => s.enabled).length;
                const hasCommission = sections.some((s) => s.enabled && s.kind === "commission");
                return (
                  <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5">
                      <Link href={`/erp/candidates/offer-templates/${t.id}`} className="font-medium text-gray-800 hover:underline">
                        {t.name}
                      </Link>
                      {hasCommission ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Commission</span>
                      ) : null}
                      {t.archived ? (
                        <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">Archived</span>
                      ) : null}
                      {t.description ? <p className="mt-0.5 text-xs text-gray-500">{t.description}</p> : null}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{on}</td>
                    <td className="px-4 py-2.5 text-gray-600">{t._count.letters}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500" title={t.updatedBy ?? undefined}>
                      {t.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit ? <DuplicateTemplateButton id={t.id} /> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
