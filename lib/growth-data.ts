import { cacheLife } from "next/cache";
import {
  getSubscriberTransitionList,
  getYoutubeSubscriberRanking,
} from "@/lib/gcs";
import { buildCalendarMonthGrowth, buildGrowthItems } from "@/lib/ranking";
import type { SubscriberGrowthData } from "@/types";

/**
 * 推移データは日々増えて fetch キャッシュ上限(2MB)を超えるため、
 * 集計後の小さな結果を "use cache" で保持する。失敗時は例外を投げる。
 */
export async function getGrowthData(): Promise<SubscriberGrowthData> {
  "use cache";
  cacheLife("hours");
  const [transitions, master] = await Promise.all([
    getSubscriberTransitionList(),
    getYoutubeSubscriberRanking(),
  ]);
  return buildGrowthItems(transitions, master);
}

export async function getCalendarMonthGrowth(
  month: string,
  throughDate: string,
) {
  "use cache";
  cacheLife("hours");
  const [transitions, master] = await Promise.all([
    getSubscriberTransitionList(),
    getYoutubeSubscriberRanking(),
  ]);
  return buildCalendarMonthGrowth(transitions, master, month, throughDate);
}
