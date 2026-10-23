import { OfferLetterBuilder } from "./OfferLetterBuilder";
import { loadActiveTemplates, loadOfferBuilder } from "./loadBuilder";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ template?: string }> };

/** New offer letter for an office candidate. */
export default async function NewOfferLetterPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { template } = await searchParams;
  const [{ candidate, defaults, salaryHint }, templates] = await Promise.all([loadOfferBuilder(id), loadActiveTemplates()]);
  return (
    <OfferLetterBuilder
      candidate={candidate}
      templates={templates}
      letter={null}
      defaults={defaults}
      initialTemplateId={templates.some((t) => t.id === template) ? template! : null}
      salaryHint={salaryHint}
    />
  );
}
