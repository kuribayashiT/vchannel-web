import { GrowthTop3 } from "@/components/GrowthTop3";
import { StreamTabs } from "@/components/StreamTabs";
import { GcsFetchError, getLiveVideoList } from "@/lib/gcs";
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

export default async function Home() {
  let videos: Video[] = [];
  let failed = false;
  const growthPromise = loadWeeklyGrowth();
  try {
    videos = await getLiveVideoList();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
    failed = true;
  }

  const growth = await growthPromise;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <GrowthTop3 items={growth} />
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">配信</h1>
      {failed ? (
        <p className="py-16 text-center text-zinc-500">
          動画の読み込みに失敗しました。
        </p>
      ) : (
        <StreamTabs videos={videos} />
      )}
    </main>
  );
}
