import Link from "next/link";
import { getArticlesByCategory } from "@/lib/help";
import { getErpAuth } from "@/lib/erpAuth";

const categoryOrder = ["Projects", "Workers", "Schedule", "Compensation", "General"];

const categoryIcons: Record<string, React.ReactNode> = {
  Projects: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  Workers: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  Schedule: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
  Compensation: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default async function HelpIndexPage() {
  const auth = await getErpAuth();
  const byCategory = getArticlesByCategory(auth?.role);

  const orderedCategories = [
    ...categoryOrder.filter((c) => byCategory[c]),
    ...Object.keys(byCategory).filter((c) => !categoryOrder.includes(c)),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Help Center</h1>
        <p className="mt-1 text-sm text-gray-500">
          Guides, tutorials, and SOPs for using the Sueep ERP.
        </p>
      </div>

      <div className="space-y-8">
        {orderedCategories.map((category) => (
          <section key={category}>
            <div className="mb-3 flex items-center gap-2 text-pink-600">
              {categoryIcons[category] ?? null}
              <h2 className="text-sm font-semibold uppercase tracking-wider">{category}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {byCategory[category].map((article) => (
                <Link
                  key={article.slug}
                  href={`/erp/help/${article.slug}`}
                  className="group rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md hover:border-pink-200"
                >
                  <p className="font-medium text-gray-900 group-hover:text-pink-700 transition-colors">
                    {article.title}
                  </p>
                  {article.description && (
                    <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                      {article.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
