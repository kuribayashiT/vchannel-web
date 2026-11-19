import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedVTuberPageData } from "@/lib/server-data";
import { getAllGuides, getGuide } from "@/lib/guide";
import { OPERATOR_NAME, SITE_URL } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllGuides().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guide/${guide.slug}` },
    openGraph: {
      type: "article",
      title: guide.title,
      description: guide.description,
      url: `/guide/${guide.slug}`,
      publishedTime: guide.publishedAt,
      modifiedTime: guide.updatedAt ?? guide.publishedAt,
    },
    twitter: { title: guide.title, description: guide.description },
  };
}

export default async function GuideArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const relatedVtubers = guide.relatedVtubers?.length
    ? (await getCachedVTuberPageData()).directoryItems.filter((vtuber) =>
        guide.relatedVtubers?.includes(vtuber.channelId),
      )
    : [];
  const articleUrl = `${SITE_URL}/guide/${guide.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: guide.title,
        description: guide.description,
        datePublished: guide.publishedAt,
        dateModified: guide.updatedAt ?? guide.publishedAt,
        author: {
          "@type": "Organization",
          name: OPERATOR_NAME,
          url: `${SITE_URL}/about`,
        },
        mainEntityOfPage: articleUrl,
        url: articleUrl,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ホーム", item: SITE_URL },
          {
            "@type": "ListItem",
            position: 2,
            name: "ガイド・特集",
            item: `${SITE_URL}/guide`,
          },
          { "@type": "ListItem", position: 3, name: guide.title, item: articleUrl },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <nav aria-label="パンくずリスト" className="mb-5 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ホーム
        </Link>
        <span className="mx-2" aria-hidden>
          ›
        </span>
        <Link href="/guide" className="hover:underline">
          ガイド・特集
        </Link>
        <span className="mx-2" aria-hidden>
          ›
        </span>
        <span aria-current="page">{guide.title}</span>
      </nav>

      <article>
        <header className="mb-8 border-b border-zinc-200 pb-5 dark:border-zinc-800">
          <p className="mb-2 text-sm font-medium text-blue-700 dark:text-blue-300">
            {guide.category}
          </p>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight md:text-3xl">
            {guide.title}
          </h1>
          <p className="mt-3 leading-7 text-zinc-600 dark:text-zinc-300">
            {guide.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              公開日：
              <time dateTime={guide.publishedAt}>{guide.publishedAt}</time>
            </span>
            {guide.updatedAt && (
              <span>
                更新日：
                <time dateTime={guide.updatedAt}>{guide.updatedAt}</time>
              </span>
            )}
            <span>運営者：{OPERATOR_NAME}</span>
          </div>
        </header>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <div
          className="guide-markdown space-y-4 leading-7 text-zinc-700 dark:text-zinc-300 [&_a]:text-blue-700 [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-blue-300 [&_blockquote]:border-l-4 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-4 [&_h2]:mt-9 [&_h2]:border-b [&_h2]:border-zinc-200 [&_h2]:pb-2 [&_h2]:text-xl [&_h2]:font-bold dark:[&_h2]:border-zinc-700 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-bold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-100 [&_pre]:p-4 dark:[&_pre]:bg-zinc-900 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-left [&_td]:border [&_td]:border-zinc-200 [&_td]:px-3 [&_td]:py-2 dark:[&_td]:border-zinc-700 [&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-100 [&_th]:px-3 [&_th]:py-2 dark:[&_th]:border-zinc-700 dark:[&_th]:bg-zinc-900 [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: guide.html }}
        />
      </article>

      {relatedVtubers.length > 0 && (
        <section className="mt-10" aria-labelledby="related-vtubers-title">
          <h2 id="related-vtubers-title" className="mb-3 text-lg font-bold">
            関連VTuber
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {relatedVtubers.map((vtuber) => (
              <Link
                key={vtuber.channelId}
                href={`/vtuber/${vtuber.channelId}`}
                className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-blue-400 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="font-bold">{vtuber.name}</span>
                <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
                  {vtuber.office}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
