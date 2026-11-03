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
