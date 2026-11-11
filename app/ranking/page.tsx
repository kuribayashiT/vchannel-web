import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { RakutenMotionWidget } from "@/components/RakutenMotionWidget";
import { RankingTabs } from "@/components/RankingTabs";
import { formatNumber } from "@/lib/format";
import {
  GcsFetchError,
  getWeeklyLiveViewRanking,
} from "@/lib/gcs";
import {
  growthHeading,
  toWeeklyRankingRows,
  weeklyHeading,
  type RankingOtherData,
  type RankingRow,
} from "@/lib/ranking";
import { getOtherRankingData } from "@/lib/ranking-data";
import {
  buildRankingQuery,
  type RankingViewState,
  parseRankingQuery,
  rankingMeta,
} from "@/lib/rankingQuery";
import { SITE_URL } from "@/lib/site";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export const instant = false;

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const state = parseRankingQuery(await searchParams);
  const { title, description } = rankingMeta(state);
  const query = buildRankingQuery(state);
  const canonical = query ? `/ranking?${query}` : "/ranking";
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { title, description },
  };
}

async function load() {
  return toWeeklyRankingRows(await getWeeklyLiveViewRanking());
}

async function getRankingRenderTime(): Promise<Date> {
  "use cache";
  cacheLife("hours");
  return new Date();
}

function summaryText(
  state: RankingViewState,
  rows: RankingRow[],
  otherData: RankingOtherData | null,
  now: Date,
): string {
  const first = rows[0];
  if (!first) return "ランキングデータがありません。";
  if (state.tab === "live") {
    return `${weeklyHeading(now)}ランキング1位は${first.name}（${formatNumber(first.value)}${first.unit}）です。`;
  }
  if (state.tab === "growth" && otherData?.growth) {
    const period = otherData.growth[state.period];
    return `${growthHeading(period.from, period.to)}ランキング1位は${first.name}（+${formatNumber(first.value)}人）です。`;
  }
  if (state.tab === "subscribers") {
    return `YouTube登録者数ランキング1位は${first.name}（${formatNumber(first.value)}人）です。`;
  }
  return `動画本数ランキング1位は${first.name}（${formatNumber(first.value)}本）です。`;
}

function visibleRows(
  state: RankingViewState,
  weekly: RankingRow[],
  otherData: RankingOtherData | null,
): RankingRow[] {
  if (state.tab === "live") return weekly;
  if (state.tab === "subscribers") return otherData?.subscribers ?? [];
  if (state.tab === "videos") return otherData?.videoCounts ?? [];
  return otherData?.growth?.[state.period].items ?? [];
}

export default async function RankingPage({ searchParams }: PageProps) {
  const state = parseRankingQuery(await searchParams);
  let weekly: Awaited<ReturnType<typeof load>> | null = null;
  let otherData: RankingOtherData | null = null;

  // searchParams を使う route なので params を受け取らずとも既定表示は live/week
  // URL 指定時の canonical/meta は generateMetadata 側で処理する。
  try {
    weekly = await load();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
  }

  if (state.tab !== "live") {
    // non-live タブの初期HTML要約と JSON-LD 用データをサーバーで用意する
    // （クライアントでも同じ API から補完される）
    try {
      otherData = await getOtherRankingData();
    } catch (e) {
      if (!(e instanceof GcsFetchError)) throw e;
    }
  }

  const now = await getRankingRenderTime();
  const rows = visibleRows(state, weekly ?? [], otherData);
  const summary = summaryText(state, rows, otherData, now);
  const top10 = rows.slice(0, 10);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "ランキング",
    itemListElement: top10.map((row, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/vtuber/${row.channelId}`,
      name: row.name,
    })),
  };
  const updatedAt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">
        ランキング
      </h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">{summary}</p>
      {top10.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      {weekly ? (
        <Suspense
          fallback={
            <p className="py-16 text-center text-zinc-500">読み込み中…</p>
          }
        >
          <RankingTabs weekly={weekly} initialOtherData={otherData} />
        </Suspense>
      ) : (
        <p className="py-16 text-center text-zinc-500">
          ランキングの読み込みに失敗しました。
        </p>
      )}
      <RakutenMotionWidget />
      <p className="mt-6 text-right text-xs text-zinc-500">
        最終更新: {updatedAt}
      </p>
    </main>
  );
}
