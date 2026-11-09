import type {
  SubscriberGrowthData,
  SubscriberGrowthItem,
  SubscriberGrowthPeriodData,
  SubscriberTransitionMap,
  Video,
  VideoCountRankingItem,
  YoutubeSubscriberRankingItem,
} from "@/types";
import { smallAvatar } from "@/lib/url";

export type RankingTab = "weekly" | "growth" | "subscribers" | "videos";

export const RANKING_TABS: { key: RankingTab; label: string }[] = [
  { key: "weekly", label: "週間同時視聴者数" },
  { key: "growth", label: "登録者 急上昇" },
  { key: "subscribers", label: "YouTube登録者数" },
  { key: "videos", label: "動画本数" },
];

export interface RankingRow {
  channelId: string;
  name: string;
  office: string;
  thumbnail: string;
  value: number;
  unit: string;
  /** 週間ランキングのみ: 配信タイトルと動画 ID */
  sub?: string;
  videoId?: string;
  /** 急上昇ランキングのみ */
  rate?: number;
  spark?: number[];
}

export type RankingGrowthPeriod = Pick<
  SubscriberGrowthPeriodData,
  "from" | "to"
> & { items: RankingRow[] };

export interface RankingPageData {
  weekly: RankingRow[];
  subscribers: RankingRow[];
  videoCounts: RankingRow[];
  growth: Record<"week" | "month", RankingGrowthPeriod> | null;
}

export type RankingOtherData = Pick<
  RankingPageData,
  "subscribers" | "videoCounts" | "growth"
>;

const RANKING_LIMIT = 100;

function topRankingRows<T>(
  items: T[],
  valueOf: (item: T) => number,
  toRow: (item: T) => RankingRow,
): RankingRow[] {
  return [...items]
    .sort((a, b) => valueOf(b) - valueOf(a))
    .slice(0, RANKING_LIMIT)
    .map(toRow);
}

export function toSubscriberRankingRows(
  items: YoutubeSubscriberRankingItem[],
): RankingRow[] {
  return topRankingRows(
    items,
    (item) => item.youtubeSubscriberCount,
    (i) => ({
      channelId: i.channelId,
      name: i.name,
      office: i.office,
      thumbnail: smallAvatar(i.channelThumbnail),
      value: i.youtubeSubscriberCount,
      unit: "人",
    }),
  );
}

export function toVideoCountRankingRows(
  items: VideoCountRankingItem[],
): RankingRow[] {
  return topRankingRows(
    items,
    (item) => item.videoCount,
    (i) => ({
      channelId: i.channelId,
      name: i.name,
      office: i.office,
      thumbnail: smallAvatar(i.channelThumbnail),
      value: i.videoCount,
      unit: "本",
    }),
  );
}

export function toWeeklyRankingRows(
  videos: Video[],
): RankingRow[] {
  return topRankingRows(
    videos,
    (video) => video.concurrentViewers,
    (v) => ({
      channelId: v.channelId,
      name: v.channelTitle,
      office: v.office,
      thumbnail: smallAvatar(v.channelThumbnail),
      value: v.concurrentViewers,
      unit: "人",
      sub: v.title,
      videoId: v.videoId,
    }),
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

// ---------- 登録者 急上昇 ----------

const DAY_MS = 86_400_000;
const STALE_DAYS = 2;
const MONTH_MIN_SPAN_DAYS = 21;

function ymdToMs(ymd: string): number {
  return Date.UTC(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8)),
  );
}

function msToYmd(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

/**
 * 推移データから期間別の増加数ランキングを作る（サーバー側で実行する純粋関数）。
 * YouTube の登録者数は概数のため増加数 0 以下は除外する。
 */
export function buildGrowthItems(
  transitions: SubscriberTransitionMap,
  master: YoutubeSubscriberRankingItem[],
): SubscriberGrowthData {
  const info = new Map(master.map((m) => [m.channelId, m]));

  let latest = "";
  for (const points of Object.values(transitions)) {
    const last = points[points.length - 1]?.date ?? "";
    if (last > latest) latest = last;
  }
  if (!latest) {
    const empty = { from: "", to: "", items: [] };
    return { week: empty, month: empty };
  }
  const latestMs = ymdToMs(latest);
  const weekBase = msToYmd(latestMs - 7 * DAY_MS);

  const week: SubscriberGrowthItem[] = [];
  const month: SubscriberGrowthItem[] = [];
  let monthFrom = latest;

  for (const [channelId, points] of Object.entries(transitions)) {
    const meta = info.get(channelId);
    const end = points[points.length - 1];
    if (!meta || !end) continue;
    if (latestMs - ymdToMs(end.date) >= STALE_DAYS * DAY_MS) continue;

    const make = (baseIdx: number): SubscriberGrowthItem | null => {
      const base = points[baseIdx];
      const growth = end.count - base.count;
      if (growth <= 0) return null;
      return {
        channelId,
        name: meta.name,
        office: meta.office,
        thumbnail: meta.channelThumbnail,
        current: end.count,
        growth,
        rate: base.count > 0 ? (growth / base.count) * 100 : 0,
        spark: points.slice(baseIdx).map((p) => p.count),
      };
    };

    // 欠損日があるため「N 件前」ではなく日付で基準点を探す
    let weekIdx = -1;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].date <= weekBase) {
        weekIdx = i;
        break;
      }
    }
    if (weekIdx >= 0) {
      const item = make(weekIdx);
      if (item) week.push(item);
    }

    if (latestMs - ymdToMs(points[0].date) >= MONTH_MIN_SPAN_DAYS * DAY_MS) {
      const item = make(0);
      if (item) {
        month.push(item);
        if (points[0].date < monthFrom) monthFrom = points[0].date;
      }
    }
  }

  const byGrowth = (a: SubscriberGrowthItem, b: SubscriberGrowthItem) =>
    b.growth - a.growth || b.rate - a.rate || b.current - a.current;
  week.sort(byGrowth);
  month.sort(byGrowth);

  const w: SubscriberGrowthPeriodData = {
    from: weekBase,
    to: latest,
    items: week,
  };
  const m: SubscriberGrowthPeriodData = {
    from: monthFrom,
    to: latest,
    items: month,
  };
  return { week: w, month: m };
}

/** サーバーで並び替え済みのため順序は保つ。選択チャンネルがあれば絞り込む */
export function toGrowthRankingPeriod(
  period: SubscriberGrowthPeriodData,
): RankingGrowthPeriod {
  return {
    from: period.from,
    to: period.to,
    items: topRankingRows(
      period.items,
      (item: SubscriberGrowthItem) => item.growth,
      (item) => ({
        channelId: item.channelId,
        name: item.name,
        office: item.office,
        thumbnail: smallAvatar(item.thumbnail),
        value: item.growth,
        unit: "人",
        rate: item.rate,
        spark: item.spark,
      }),
    ),
  };
}

/** `MM/dd 〜 MM/dd の登録者増加数` */
export function growthHeading(from: string, to: string): string {
  const f = (ymd: string) => `${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`;
  return `${f(from)} 〜 ${f(to)} の登録者増加数`;
}
