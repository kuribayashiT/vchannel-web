import { cacheLife } from "next/cache";
import { getOfficeDataList } from "@/lib/gcs";
import type { OfficeDataList } from "@/types";

export interface OfficeMember {
  channelId: string;
  name: string;
}

export interface OfficeSummary {
  name: string;
  members: OfficeMember[];
}

const YT3_PREFIX = "https://yt3.ggpht.com/";
const SIZE_PARAM_PATTERN = /=s[^?]*/;

/** yt3 の URL は容量削減のため短縮形へ。非 yt3 ホストはそのまま保持する。 */
export function shortenThumbnailUrl(url: string): string {
  if (!url) return "";
  if (!url.startsWith(YT3_PREFIX)) return url;
  return url.slice(YT3_PREFIX.length).replace(SIZE_PARAM_PATTERN, "");
}

/** クライアントへ渡す軽量版（officedataList は大きいので必要項目のみ）。公式アカウントを先頭に */
export function summarizeOffices(list: OfficeDataList): OfficeSummary[] {
  return Object.entries(list).map(([name, vtubers]) => ({
    name,
    members: [...vtubers]
      .filter((v) => v.channelId)
      .sort((a, b) => Number(b.officeFlg) - Number(a.officeFlg))
      .map((v) => ({ channelId: v.channelId, name: v.name })),
  }));
}

/** 軽量化した事務所一覧をキャッシュして返す（元データが大きいため） */
export async function getOfficeSummaries(): Promise<OfficeSummary[]> {
  "use cache";
  cacheLife("hours");
  return summarizeOffices(await getOfficeDataList());
}

/** フィルター表示時に読む、チャンネル ID → サムネイル短縮 URL */
export async function getOfficeThumbnails(): Promise<Record<string, string>> {
  "use cache";
  cacheLife("hours");
  const list = await getOfficeDataList();
  const thumbnails: Record<string, string> = {};
  for (const vtubers of Object.values(list)) {
    for (const vtuber of vtubers) {
      if (!vtuber.channelId || !vtuber.channelThumbnail) continue;
      thumbnails[vtuber.channelId] = shortenThumbnailUrl(vtuber.channelThumbnail);
    }
  }
  return thumbnails;
}
