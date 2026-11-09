import Link from "next/link";
import { Radio, Sparkles, Trophy, Users } from "lucide-react";
import { GrowthTop3 } from "@/components/GrowthTop3";
import { SectionHeader } from "@/components/SectionHeader";
import { StreamTabs } from "@/components/StreamTabs";
import { GcsFetchError, getAllVideos, getLiveVideoList } from "@/lib/gcs";
import { getGrowthData } from "@/lib/growth-data";
import type { SubscriberGrowthItem, Video } from "@/types";

const TOP_CANDIDATES = 30;

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

export default async function Home() {
  let liveVideos: Video[] = [];
  let allVideos: Video[] = [];
  let failed = false;
  const growthPromise = loadWeeklyGrowth();
  try {
    liveVideos = await getLiveVideoList();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
    failed = true;
  }
  try {
    allVideos = await getAllVideos();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
    allVideos = [];
  }

  const growth = await growthPromise;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <Hero />
      <GrowthTop3 items={growth} />
      <section id="streams" aria-labelledby="home-streams-title" className="scroll-mt-20">
        <SectionHeader
          id="home-streams-title"
          as="h2"
          title="配信"
          icon={Radio}
        />
        {failed ? (
          <p className="py-16 text-center text-zinc-500">
            動画の読み込みに失敗しました。
          </p>
        ) : (
          <StreamTabs liveVideos={liveVideos} allVideos={allVideos} />
        )}
      </section>
    </main>
  );
}
