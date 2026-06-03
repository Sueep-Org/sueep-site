import { registry } from "@/content/help/registry";
import type { ArticleEntry } from "@/content/help/registry";

export type ArticleMeta = Omit<ArticleEntry, "component">;
export type Article = ArticleEntry;

export function getAllArticles(): ArticleMeta[] {
  return registry
    .map(({ component: _, ...meta }) => meta)
    .sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
}

export function getArticle(slug: string): Article | null {
  return registry.find((a) => a.slug === slug) ?? null;
}

export function getArticlesByCategory(): Record<string, ArticleMeta[]> {
  return getAllArticles().reduce<Record<string, ArticleMeta[]>>((acc, article) => {
    (acc[article.category] ??= []).push(article);
    return acc;
  }, {});
}
