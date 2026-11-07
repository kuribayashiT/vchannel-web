import type { Metadata } from "next";
import { Suspense } from "react";
import { getGrowthData } from "@/lib/growth-data";
import { RankingTabs } from "@/components/RankingTabs";
import {
  GcsFetchError,
  getVideoCountRanking,
  getWeeklyLiveViewRanking,
  getYoutubeSubscriberRanking,
} from "@/lib/gcs";
import {
  buildRankingQuery,
  parseRankingQuery,
  rankingMeta,
} from "@/lib/rankingQuery";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
  const [weekly, subscribers, videoCounts] = await Promise.all([
    getWeeklyLiveViewRanking(),
    getYoutubeSubscriberRanking(),
    getVideoCountRanking(),
  ]);
  // 推移データだけ失敗しても既存タブは表示する
  const growth = await getGrowthData().catch((e) => {
    if (!(e instanceof GcsFetchError)) throw e;
    return null;
  });
  return { weekly, subscribers, videoCounts, growth };
}

export default async function RankingPage() {
  let data: Awaited<ReturnType<typeof load>> | null = null;
  try {
    data = await load();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">
        ランキング
      </h1>
      {data ? (
        <Suspense
          fallback={
            <p className="py-16 text-center text-zinc-500">読み込み中…</p>
          }
        >
          <RankingTabs {...data} />
        </Suspense>
      ) : (
        <p className="py-16 text-center text-zinc-500">
          ランキングの読み込みに失敗しました。
        </p>
      )}
    </main>
  );
}
