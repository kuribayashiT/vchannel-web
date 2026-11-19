import type { Metadata } from "next";
import Link from "next/link";
import { GuideCard } from "@/components/GuideCard";
import { GUIDE_CATEGORIES, getAllGuides } from "@/lib/guide";

const PAGE_TITLE = "ガイド・特集";
const PAGE_DESCRIPTION =
  "Vちゃんねるの使い方やVTuberに関するガイド・特集記事を掲載しています。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/guide" },
  openGraph: { title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: "/guide" },
  twitter: { title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

export default function GuideIndexPage() {
  const guides = getAllGuides();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <nav aria-label="パンくずリスト" className="mb-4 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ホーム
        </Link>
        <span className="mx-2" aria-hidden>
          ›
        </span>
        <span aria-current="page">ガイド・特集</span>
      </nav>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">
        ガイド・特集
      </h1>
      <p className="mb-8 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        Vちゃんねるの使い方や、VTuberにまつわる情報を記事で紹介します。
      </p>

      <div className="space-y-8">
        {GUIDE_CATEGORIES.map((category) => {
          const categoryGuides = guides.filter(
            (guide) => guide.category === category,
          );
          if (categoryGuides.length === 0) return null;

          return (
            <section key={category} aria-labelledby={`category-${category}`}>
              <h2
                id={`category-${category}`}
                className="mb-3 text-lg font-bold"
              >
                {category}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {categoryGuides.map((guide) => (
                  <GuideCard key={guide.slug} guide={guide} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
