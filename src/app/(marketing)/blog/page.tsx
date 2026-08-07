import Link from "next/link";
import type { Metadata } from "next";
import { PAINTING_BLOG_POSTS } from "./posts";
import { MarketingNav } from "../components/MarketingNav";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sueep.com";

const blogDescription =
  "Guides and ideas for interior painting, prep, color and sheen choices, and getting your home ready to sell—focused on homeowners in Greater Philadelphia and nearby markets.";

export const metadata: Metadata = {
  title: "Residential Painting Blog & Tips | Sueep",
  description: blogDescription,
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Residential Painting Blog | Sueep",
    description:
      "Practical articles on interior painting prep, listing-ready repaints, and choosing finishes for your home.",
    url: `${siteUrl}/blog`,
    type: "website",
  },
};

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogIndexPage() {
  const sorted = [...PAINTING_BLOG_POSTS].sort(
    (a, b) => new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime()
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Sueep — Residential Painting Blog",
    description: blogDescription,
    url: `${siteUrl}/blog`,
    blogPost: sorted.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      datePublished: p.datePublished,
      url: `${siteUrl}/blog/${p.slug}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="bg-white text-gray-900 min-h-screen">
        <MarketingNav />
        <header className="border-b border-gray-200 bg-gray-50">
          <div className="max-w-3xl mx-auto px-5 py-10 md:py-14">
            <p className="text-sm font-medium text-[#E73C6E] uppercase tracking-wide">
              Sueep · Homeowners
            </p>
            <h1 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
              Residential painting blog
            </h1>
            <p className="mt-4 text-lg text-gray-600 leading-relaxed">
              Articles on prep, paint choices, and timing—written to help you plan interior painting projects
              with confidence. Based in the Philadelphia area; relevant wherever you own a home.
            </p>
            <nav className="mt-6 text-sm" aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-2 text-gray-500">
                <li>
                  <Link href="/" className="hover:text-[#E73C6E]">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li className="text-gray-900 font-medium">Blog</li>
              </ol>
            </nav>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-5 py-12 md:py-16">
          <h2 className="sr-only">Latest articles</h2>
          <ul className="space-y-10 md:space-y-12">
            {sorted.map((post) => (
              <li key={post.slug}>
                <article className="border-b border-gray-100 pb-10 md:pb-12 last:border-0 last:pb-0">
                  <time
                    dateTime={post.datePublished}
                    className="text-sm text-gray-500"
                  >
                    {formatDate(post.datePublished)}
                  </time>
                  <h3 className="mt-2 text-xl md:text-2xl font-bold text-gray-900">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="hover:text-[#E73C6E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E73C6E]/50 rounded"
                    >
                      {post.title}
                    </Link>
                  </h3>
                  <p className="mt-3 text-gray-600 leading-relaxed">{post.excerpt}</p>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="mt-4 inline-flex text-sm font-semibold text-[#E73C6E] hover:underline"
                  >
                    Read article
                  </Link>
                </article>
              </li>
            ))}
          </ul>

          <aside className="mt-14 p-6 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-sm text-gray-700 leading-relaxed">
              Need a quote for interior or exterior painting?{" "}
              <Link href="/painting" className="font-semibold text-[#E73C6E] hover:underline">
                Visit our residential painting page
              </Link>{" "}
              or{" "}
              <Link href="/#contact" className="font-semibold text-[#E73C6E] hover:underline">
                contact Sueep
              </Link>
              .
            </p>
          </aside>
        </div>
      </main>
    </>
  );
}
