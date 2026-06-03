import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllArticles, getArticle, getArticlesByCategory } from "@/lib/help";
import { BackToTop } from "@/app/erp/components/help/BackToTop";

type Params = { slug: string[] };

export async function generateStaticParams() {
  return getAllArticles().map((a) => ({ slug: a.slug.split("/") }));
}

const categoryOrder = ["Projects", "Contracts", "Turnover", "SOPs", "General"];

export default async function HelpArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const slugStr = Array.isArray(slug) ? slug.join("/") : slug;
  const article = getArticle(slugStr);
  if (!article) notFound();

  const ArticleContent = article.component;
  const byCategory = getArticlesByCategory();
  const orderedCategories = [
    ...categoryOrder.filter((c) => byCategory[c]),
    ...Object.keys(byCategory).filter((c) => !categoryOrder.includes(c)),
  ];

  return (
    <>
    <div className="mx-auto max-w-5xl">
      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <Link
            href="/erp/help"
            className="mb-4 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Help Center
          </Link>
          <nav className="space-y-4">
            {orderedCategories.map((category) => (
              <div key={category}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {category}
                </p>
                <div className="flex flex-col gap-0.5">
                  {byCategory[category].map((a) => (
                    <Link
                      key={a.slug}
                      href={`/erp/help/${a.slug}`}
                      className={[
                        "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                        a.slug === slugStr
                          ? "bg-pink-50 font-medium text-pink-700"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                      ].join(" ")}
                    >
                      {a.title}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Article */}
        <div className="min-w-0 flex-1">
          <Link
            href="/erp/help"
            className="mb-4 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 lg:hidden"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Help Center
          </Link>

          <h1 className="text-2xl font-semibold text-pink-700">{article.title}</h1>
          {article.description && (
            <p className="mt-2 text-sm text-gray-500">{article.description}</p>
          )}

          <div className="mt-6 border-t border-gray-100 pt-6">
            <ArticleContent />
          </div>
        </div>
      </div>
    </div>
    <BackToTop />
    </>
  );
}
