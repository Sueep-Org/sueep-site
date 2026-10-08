import { getArticlesByCategory } from "@/lib/help";
import { getErpAuth } from "@/lib/erpAuth";
import { HelpSearch, type HelpCategory } from "@/app/erp/components/help/HelpSearch";

const categoryOrder = ["Projects", "Turnovers & Buildings", "Janitorial Contracts", "People & Schedule", "Billing, Pay & Finance", "Insurance & COIs", "Company Info"];

export default async function HelpIndexPage() {
  const auth = await getErpAuth();
  const byCategory = getArticlesByCategory(auth?.role);

  // Known categories in order, then any new one an article adds.
  const categories: HelpCategory[] = [
    ...categoryOrder.filter((c) => byCategory[c]),
    ...Object.keys(byCategory).filter((c) => !categoryOrder.includes(c)),
  ].map((name) => ({
    name,
    articles: byCategory[name].map((a) => ({ slug: a.slug, title: a.title, description: a.description, category: a.category })),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Help Center</h1>
        <p className="mt-1 text-sm text-gray-500">
          Guides, tutorials, and SOPs for using the Sueep ERP.
        </p>
      </div>
      <HelpSearch categories={categories} />
    </div>
  );
}
