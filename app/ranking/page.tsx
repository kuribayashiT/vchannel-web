import { RankingTabs } from "@/components/RankingTabs";
import {
  GcsFetchError,
  getVideoCountRanking,
  getWeeklyLiveViewRanking,
  getYoutubeSubscriberRanking,
} from "@/lib/gcs";

export const metadata = { title: "ランキング | Vちゃんねる" };

async function load() {
  const [weekly, subscribers, videoCounts] = await Promise.all([
    getWeeklyLiveViewRanking(),
    getYoutubeSubscriberRanking(),
    getVideoCountRanking(),
  ]);
  return { weekly, subscribers, videoCounts };
}

export default async function RankingPage() {
  let data: Awaited<ReturnType<typeof load>> | null = null;
  try {
    data = await load();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <h1 className="mb-4 text-xl font-bold">ランキング</h1>
      {data ? (
        <RankingTabs {...data} />
      ) : (
        <p className="py-16 text-center text-zinc-500">
          ランキングの読み込みに失敗しました。
        </p>
      )}
    </main>
  );
}
