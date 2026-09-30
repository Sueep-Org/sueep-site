"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

export type HelpArticleCard = { slug: string; title: string; description: string; category: string };
export type HelpCategory = { name: string; articles: HelpArticleCard[] };

const iconProps = { className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5 } as const;

const categoryIcons: Record<string, ReactNode> = {
  Projects: (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  "Turnovers & Buildings": (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 21V4.5a.75.75 0 01.75-.75h9a.75.75 0 01.75.75V21M4.5 21h15M4.5 21H3M19.5 21H21M14.25 21v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21M7.5 7.5h1.5M7.5 11h1.5M7.5 14.5h1.5M12 7.5h1.5M12 11h1.5M15.75 3.75H19.5a.75.75 0 01.75.75V21" />
    </svg>
  ),
  "Janitorial Contracts": (
    <svg {...iconProps}>
      <g transform="rotate(35 12 12)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5V12" />
        <rect x="9.75" y="12" width="4.5" height="2.5" rx="0.5" />
        <path d="M9.75 14.5L7 21h10l-2.75-6.5" />
        <path d="M10.75 17.25l-.5 3.75M13.25 17.25l.5 3.75" />
      </g>
    </svg>
  ),
  "People & Schedule": (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  "Billing, Pay & Finance": (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

/** Every word typed has to appear somewhere in the title, description, or category. */
function matches(article: HelpArticleCard, words: string[]): boolean {
  const text = `${article.title} ${article.description} ${article.category}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

function ArticleLink({ article, showCategory }: { article: HelpArticleCard; showCategory?: boolean }) {
  return (
    <Link
      href={`/erp/help/${article.slug}`}
      className="group rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:border-pink-200 hover:shadow-md"
    >
      {showCategory && <p className="mb-1 text-xs font-medium uppercase tracking-wider text-pink-600">{article.category}</p>}
      <p className="font-medium text-gray-900 transition-colors group-hover:text-pink-700">{article.title}</p>
      {article.description && <p className="mt-1 text-sm leading-relaxed text-gray-500">{article.description}</p>}
    </Link>
  );
}

/** The Help Center's article list: a search box, then articles by category
 * (or, while searching, just the matching articles). */
export function HelpSearch({ categories }: { categories: HelpCategory[] }) {
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = words.length ? categories.flatMap((c) => c.articles).filter((a) => matches(a, words)) : [];

  return (
    <div>
      <div className="relative mb-8">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles"
          aria-label="Search help articles"
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
      </div>

      {words.length > 0 ? (
        results.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">No articles match &ldquo;{query.trim()}&rdquo;.</p>
        ) : (
          <div>
            <p className="mb-3 text-xs text-gray-500">{results.length} article{results.length === 1 ? "" : "s"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((a) => <ArticleLink key={a.slug} article={a} showCategory />)}
            </div>
          </div>
        )
      ) : (
        <div className="space-y-8">
          {categories.map((category) => (
            <section key={category.name}>
              <div className="mb-3 flex items-center gap-2 text-pink-600">
                {categoryIcons[category.name] ?? null}
                <h2 className="text-sm font-semibold uppercase tracking-wider">{category.name}</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {category.articles.map((a) => <ArticleLink key={a.slug} article={a} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
