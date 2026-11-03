import type {
  Video,
  VideoCountRankingItem,
  YoutubeSubscriberRankingItem,
} from "@/types";

export type RankingTab = "weekly" | "subscribers" | "videos";

export const RANKING_TABS: { key: RankingTab; label: string }[] = [
  { key: "weekly", label: "週間同時視聴者数" },
  { key: "subscribers", label: "YouTube登録者数" },
  { key: "videos", label: "動画本数" },
];

export interface RankingRow {
  key: string;
  channelId: string;
  name: string;
  office: string;
  thumbnail: string;
  value: number;
  unit: string;
  /** 週間ランキングのみ: 配信タイトルと動画 ID */
  sub?: string;
  videoId?: string;
}

/** 選択チャンネルで絞り込み（空 = 全件）して値の降順に並べる */
function rank(rows: RankingRow[], channelIds: string[]): RankingRow[] {
  const filtered =
    channelIds.length === 0
      ? rows
      : rows.filter((r) => channelIds.includes(r.channelId));
  return [...filtered].sort((a, b) => b.value - a.value);
}

export function subscriberRows(
  items: YoutubeSubscriberRankingItem[],
  channelIds: string[],
): RankingRow[] {
  return rank(
    items.map((i) => ({
      key: i.channelId,
      channelId: i.channelId,
      name: i.name,
      office: i.office,
      thumbnail: i.channelThumbnail,
      value: i.youtubeSubscriberCount,
      unit: "人",
    })),
    channelIds,
  );
}

export function videoCountRows(
  items: VideoCountRankingItem[],
  channelIds: string[],
): RankingRow[] {
  return rank(
    items.map((i) => ({
      key: i.channelId,
      channelId: i.channelId,
      name: i.name,
      office: i.office,
      thumbnail: i.channelThumbnail,
      value: i.videoCount,
      unit: "本",
    })),
    channelIds,
  );
}

/** 配信（動画）単位のランキング */
export function weeklyRows(
  videos: Video[],
  channelIds: string[],
): RankingRow[] {
  return rank(
    videos.map((v) => ({
      key: v.videoId,
      channelId: v.channelId,
      name: v.channelTitle,
      office: v.office,
      thumbnail: v.channelThumbnail,
      value: v.concurrentViewers,
      unit: "人",
      sub: v.title,
      videoId: v.videoId,
    })),
    channelIds,
  );
}

const md = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
});

/** `MM/dd 〜 MM/ddの同時視聴者数`（今日から 6 日前〜今日、JST） */
export function weeklyHeading(now: Date): string {
  const from = new Date(now.getTime() - 6 * 86_400_000);
  return `${md.format(from)} 〜 ${md.format(now)}の同時視聴者数`;
}
