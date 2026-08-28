import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPostBySlug, getAllSlugs, type PaintingBlogPost } from "../posts";
import { MarketingNav } from "../../components/MarketingNav";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sueep.com";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Not found" };

  const url = `${siteUrl}/blog/${post.slug}`;

  return {
    title: `${post.title} | Sueep`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.datePublished,
    },
  };
}

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ArticleBody({ body }: { body: string }) {
  const paragraphs = body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="prose prose-gray max-w-none">
      {paragraphs.map((para, i) => (
        <p key={i} className="mt-4 first:mt-0 text-gray-700 leading-relaxed text-base md:text-lg">
          {para}
        </p>
      ))}
    </div>
  );
}

function articleJsonLd(post: PaintingBlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.datePublished,
    author: {
      "@type": "Organization",
      name: "Sueep",
    },
    publisher: {
      "@type": "Organization",
      name: "Sueep",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteUrl}/blog/${post.slug}`,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(post)) }}
      />
      <main className="bg-white text-gray-900 min-h-screen">
        <MarketingNav />
        <article className="max-w-3xl mx-auto px-5 py-10 md:py-14">
          <nav className="text-sm text-gray-500 mb-8" aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="hover:text-[#E73C6E]">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/blog" className="hover:text-[#E73C6E]">
                  Blog
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-gray-900 font-medium line-clamp-1">{post.title}</li>
            </ol>
          </nav>

          <p className="text-sm font-medium text-[#E73C6E] uppercase tracking-wide">
            Residential painting
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
            {post.title}
          </h1>
          <time dateTime={post.datePublished} className="mt-4 block text-sm text-gray-500">
            {formatDate(post.datePublished)}
          </time>
          <p className="mt-6 text-lg text-gray-600 leading-relaxed border-l-4 border-[#E73C6E]/30 pl-4">
            {post.excerpt}
          </p>

          <div className="mt-10">
            <ArticleBody body={post.body} />
          </div>

          <footer className="mt-14 pt-10 border-t border-gray-100">
            <Link
              href="/blog"
              className="text-sm font-semibold text-[#E73C6E] hover:underline"
            >
              ← Back to all articles
            </Link>
            <p className="mt-6 text-sm text-gray-600">
              Planning a project?{" "}
              <Link href="/painting" className="font-semibold text-[#E73C6E] hover:underline">
                Residential painting — Sueep
              </Link>
            </p>
          </footer>
        </article>
      </main>
    </>
  );
}
