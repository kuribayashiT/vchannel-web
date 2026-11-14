import { cacheLife } from "next/cache";
import { getOfficeDataList } from "@/lib/gcs";
import { shortenYtThumb } from "@/lib/thumbnail";
import type { OfficeDataList } from "@/types";

export interface OfficeMember {
  channelId: string;
  name: string;
}

export interface OfficeSummary {
  name: string;
  thumbnail?: string;
  members: OfficeMember[];
}

/** クライアントへ渡す軽量版（officedataList は大きいので必要項目のみ）。公式アカウントを先頭に */
export function summarizeOffices(list: OfficeDataList): OfficeSummary[] {
  return Object.entries(list).map(([name, vtubers]) => {
    const thumbnail = vtubers.find(
      (vtuber) => vtuber.officeFlg && vtuber.channelThumbnail,
    )?.channelThumbnail;
    return {
      name,
      ...(thumbnail ? { thumbnail: shortenYtThumb(thumbnail) } : {}),
      members: [...vtubers]
        .filter((v) => v.channelId)
        .sort((a, b) => Number(b.officeFlg) - Number(a.officeFlg))
        .map((v) => ({ channelId: v.channelId, name: v.name })),
    };
  });
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
      thumbnails[vtuber.channelId] = shortenYtThumb(vtuber.channelThumbnail);
    }
  }
  return thumbnails;
}
