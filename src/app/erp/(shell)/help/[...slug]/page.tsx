import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllArticles, getArticle } from "@/lib/help";
import { BackToTop } from "@/app/erp/components/help/BackToTop";

type Params = { slug: string[] };

export async function generateStaticParams() {
  return getAllArticles().map((a) => ({ slug: a.slug.split("/") }));
}

export default async function HelpArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const slugStr = Array.isArray(slug) ? slug.join("/") : slug;
  const article = getArticle(slugStr);
  if (!article) notFound();

  const ArticleContent = article.component;

  return (
    <>
      <div className="mx-auto max-w-3xl">
        <Link
          href="/erp/help"
          className="mb-6 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Help Center
        </Link>

        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-pink-600">
          {article.category}
        </div>
        <h1 className="text-2xl font-semibold text-pink-700">{article.title}</h1>
        {article.description && (
          <p className="mt-2 text-sm text-gray-500">{article.description}</p>
        )}

        <div className="mt-6 border-t border-gray-100 pt-6">
          <ArticleContent />
        </div>
      </div>
      <BackToTop />
    </>
  );
}
