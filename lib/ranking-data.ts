import { GcsFetchError, getVideoCountRanking, getYoutubeSubscriberRanking } from "@/lib/gcs";
import { getGrowthData } from "@/lib/growth-data";
import {
  toGrowthRankingPeriod,
  toSubscriberRankingRows,
  toVideoCountRankingRows,
  type RankingOtherData,
} from "@/lib/ranking";

export async function getOtherRankingData(): Promise<RankingOtherData> {
  const [subscribers, videoCounts] = await Promise.all([
    getYoutubeSubscriberRanking(),
    getVideoCountRanking(),
  ]);
  const growth = await getGrowthData().catch((e) => {
    if (!(e instanceof GcsFetchError)) throw e;
    return null;
  });
  return {
    subscribers: toSubscriberRankingRows(subscribers),
    videoCounts: toVideoCountRankingRows(videoCounts),
    growth: growth
      ? {
          week: toGrowthRankingPeriod(growth.week),
          month: toGrowthRankingPeriod(growth.month),
        }
      : null,
  };
}
