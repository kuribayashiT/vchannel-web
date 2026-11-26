import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Radio, Sparkles, Trophy, Users } from "lucide-react";
import { GrowthTop3 } from "@/components/GrowthTop3";
import { GuideCard } from "@/components/GuideCard";
import { RakutenMotionWidget } from "@/components/RakutenMotionWidget";
import { SectionHeader } from "@/components/SectionHeader";
import { StreamTabs } from "@/components/StreamTabs";
import { GcsFetchError } from "@/lib/gcs";
import { getGrowthData } from "@/lib/growth-data";
import { getAllGuides } from "@/lib/guide";
import { getCurrentReportContext, getReportComment } from "@/lib/reports";
import type { SubscriberGrowthItem } from "@/types";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const TOP_CANDIDATES = 30;
type ReportParagraphPart = { text: string; href?: string };

/** 取得に失敗しても配信タブは表示したいので空配列にフォールバック */
async function loadWeeklyGrowth(): Promise<SubscriberGrowthItem[]> {
  try {
    return (await getGrowthData()).week.items.slice(0, TOP_CANDIDATES);
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
    return [];
  }
}

const CTA_BASE =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors";

/** トップのヒーロー。サービスの価値を一言で伝え、主要ページへ誘導する */
function Hero() {
  return (
    <section
      aria-labelledby="home-hero-title"
      className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-md md:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative max-w-2xl">
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
          <Sparkles size={14} aria-hidden />
          配信・ニュース・ランキングをひとまとめ
        </p>
        <h1
          id="home-hero-title"
          className="text-2xl font-extrabold leading-tight tracking-tight md:text-3xl"
        >
          VTuberの「いま」を、
          <br className="sm:hidden" />
          ここでチェック
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/90 md:text-base">
          いま配信中のライブ、今日・明日の配信予定、登録者数の急上昇まで。
          推しの活動をひと目で追いかけられます。
          登録者数や同時視聴者数のデータをもとに、運営者が書いた特集やガイドも毎週更新しています。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="#streams"
            className={`${CTA_BASE} bg-white text-violet-700 hover:bg-white/90`}
          >
            <Radio size={16} aria-hidden />
            配信を見る
          </a>
          <Link
            href="/ranking"
            className={`${CTA_BASE} bg-white/15 text-white hover:bg-white/25`}
          >
            <Trophy size={16} aria-hidden />
            ランキング
          </Link>
          <Link
            href="/vtuber"
            className={`${CTA_BASE} bg-white/15 text-white hover:bg-white/25`}
          >
            <Users size={16} aria-hidden />
            VTuberを探す
          </Link>
        </div>
      </div>
    </section>
  );
}

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function toText(text: string): string {
  return decodeEntities(stripTags(text)).replace(/\s+/g, " ").trim();
}

function parseParagraphParts(htmlParagraph: string): ReportParagraphPart[] {
  const parts: ReportParagraphPart[] = [];
  const anchorPattern = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let lastIndex = 0;

  for (const match of htmlParagraph.matchAll(anchorPattern)) {
    const index = match.index ?? 0;
    const before = toText(htmlParagraph.slice(lastIndex, index));
    if (before) parts.push({ text: before });
    const href = match[1];
    const label = toText(match[2]);
    if (label) {
      if (href.startsWith("/")) {
        parts.push({ text: label, href });
      } else {
        parts.push({ text: label });
      }
    }
    lastIndex = index + match[0].length;
  }

  const after = toText(htmlParagraph.slice(lastIndex));
  if (after) parts.push({ text: after });
  return parts;
}

function getReportExcerpt(commentHtml: string): ReportParagraphPart[][] {
  const html = commentHtml.replace(/<!--[\s\S]*?-->/g, "");
  return [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((match) => parseParagraphParts(match[1]))
    .filter((parts) => parts.length > 0)
    .slice(0, 2);
}

export default async function Home() {
  const growthPromise = loadWeeklyGrowth();
  const reportContextPromise = getCurrentReportContext();
  const [growth, { month }] = await Promise.all([
    growthPromise,
    reportContextPromise,
  ]);
  const latestGuides = getAllGuides().slice(0, 4);
  const reportComment = getReportComment(month);
  const reportExcerpt = reportComment ? getReportExcerpt(reportComment) : [];
  const monthLabel = Number(month.slice(5, 7));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <Hero />
      <GrowthTop3 items={growth} />
      {reportExcerpt.length > 0 && (
        <section className="mt-8" aria-labelledby="home-report-highlight-title">
          <SectionHeader
            id="home-report-highlight-title"
            as="h2"
            title={`${monthLabel}月のVTuberレポートから`}
            icon={BarChart3}
          />
          <div className="space-y-3 text-sm leading-7 text-zinc-700 dark:text-zinc-200">
            {reportExcerpt.map((parts, index) => (
              <p key={`report-highlight-${index}`}>
                {parts.map((part, partIndex) =>
                  part.href ? (
                    <Link
                      key={`report-highlight-${index}-${partIndex}`}
                      href={part.href}
                      className="text-blue-700 underline dark:text-blue-300"
                    >
                      {part.text}
                    </Link>
                  ) : (
                    <span key={`report-highlight-${index}-${partIndex}`}>
                      {part.text}
                    </span>
                  ),
                )}
              </p>
            ))}
          </div>
          <Link
            href={`/reports/${month}`}
            className="mt-3 inline-flex text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
          >
            レポートの続きを読む →
          </Link>
        </section>
      )}
      {latestGuides.length > 0 && (
        <section className="mt-8" aria-labelledby="home-guides-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="home-guides-title" className="text-xl font-bold">
              ガイド・特集
            </h2>
            <Link
              href="/guide"
              className="shrink-0 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
            >
              すべて見る
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {latestGuides.map((guide) => (
              <GuideCard key={guide.slug} guide={guide} />
            ))}
          </div>
        </section>
      )}
      <section id="streams" aria-labelledby="home-streams-title" className="scroll-mt-20">
        <SectionHeader
          id="home-streams-title"
          as="h2"
          title="配信"
          icon={Radio}
        />
        <StreamTabs />
      </section>
      <RakutenMotionWidget />
    </main>
  );
}
