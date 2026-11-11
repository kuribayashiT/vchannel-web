import type { Metadata } from "next";
import { Suspense } from "react";
import { RakutenMotionWidget } from "@/components/RakutenMotionWidget";
import { RankingTabs } from "@/components/RankingTabs";
import {
  GcsFetchError,
  getWeeklyLiveViewRanking,
} from "@/lib/gcs";
import { toWeeklyRankingRows } from "@/lib/ranking";
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
  return toWeeklyRankingRows(await getWeeklyLiveViewRanking());
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
          <RankingTabs weekly={data} />
        </Suspense>
      ) : (
        <p className="py-16 text-center text-zinc-500">
          ランキングの読み込みに失敗しました。
        </p>
      )}
      <RakutenMotionWidget />
    </main>
  );
}
