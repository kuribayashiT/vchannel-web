import type { Video } from "@/types";

export type StreamTab = "past" | "live" | "today" | "tomorrow" | "later";

export type StreamCardVideo = Pick<
  Video,
  | "videoId"
  | "title"
  | "channelId"
  | "channelTitle"
  | "thumbnail"
  | "comparisonDay"
> &
  Partial<Pick<Video, "concurrentViewers">>;

export const STREAM_TABS: { key: StreamTab; label: string; empty: string }[] = [
  { key: "past", label: "過去アーカイブ", empty: "配信済みの動画はありません" },
  { key: "live", label: "配信中", empty: "配信中の動画はありません" },
  { key: "today", label: "今日の配信", empty: "配信予定の動画はありません" },
  { key: "tomorrow", label: "明日の配信", empty: "配信予定の動画はありません" },
  {
    key: "later",
    label: "明日以降の配信",
    empty: "配信予定の動画はありません",
  },
];

const jstDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const jstHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  hourCycle: "h23",
});

/** JST の暦日 "YYYY-MM-DD"。不正な日時は null */
export function jstDay(d: Date | string): string | null {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : jstDate.format(date);
}

export function jstHourOf(d: string): number | null {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : Number(jstHour.format(date));
}

/** JST 暦日の差（a - b）。"YYYY-MM-DD" 同士 */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/** 今日〜7日後の予定と、新しい順の過去アーカイブ最大60件に絞る */
export function trimStreamVideos(
  all: Video[],
  now: Date = new Date(),
): Video[] {
  const today = jstDay(now);
  if (!today) return [];
  const [year, month, day] = today.split("-").map(Number);
  const lastUpcomingDay = new Date(
    Date.UTC(year, month - 1, day + 7),
  ).toISOString().slice(0, 10);
  const upcoming: Video[] = [];
  const past: Video[] = [];

  for (const video of all) {
    const day = jstDay(video.comparisonDay);
    if (!day) continue;
    if (day >= today && day <= lastUpcomingDay) upcoming.push(video);
    else if (day < today) past.push(video);
  }

  past.sort(
    (a, b) => Date.parse(b.comparisonDay) - Date.parse(a.comparisonDay),
  );
  return [...upcoming, ...past.slice(0, 60)];
}

export function toStreamCardVideo(video: Video): StreamCardVideo {
  return {
    videoId: video.videoId,
    title: video.title,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    thumbnail: video.thumbnail,
    comparisonDay: video.comparisonDay,
  };
}

export function toLiveStreamCardVideo(video: Video): StreamCardVideo {
  return {
    ...toStreamCardVideo(video),
    concurrentViewers: video.concurrentViewers,
  };
}

/**
 * comparisonDay の JST 暦日で今日/明日/以降/過去に振り分ける。
 */
export function categorize(
  v: StreamCardVideo,
  now: Date = new Date(),
): StreamTab[] {
  const tabs: StreamTab[] = [];
  const day = jstDay(v.comparisonDay);
  const today = jstDay(now);
  if (!day || !today) return tabs;
  const diff = dayDiff(day, today);
  if (diff < 0) tabs.push("past");
  else if (diff === 0) tabs.push("today");
  else if (diff === 1) tabs.push("tomorrow");
  else tabs.push("later");
  return tabs;
}

export function groupByTab(
  videos: StreamCardVideo[],
  now: Date = new Date(),
): Record<StreamTab, StreamCardVideo[]> {
  const out: Record<StreamTab, StreamCardVideo[]> = {
    past: [],
    live: [...videos],
    today: [],
    tomorrow: [],
    later: [],
  };
  for (const v of videos) {
    for (const t of categorize(v, now)) out[t].push(v);
  }
  const time = (v: StreamCardVideo) => Date.parse(v.comparisonDay) || 0;
  out.past.sort((a, b) => time(b) - time(a));
  for (const t of ["today", "tomorrow", "later"] as const) {
    out[t].sort((a, b) => time(a) - time(b));
  }
  return out;
}

/** 0〜23 時（JST）の時間帯別グルーピング。動画のある時間帯のみ */
export function groupByHour(
  videos: StreamCardVideo[],
): { hour: number; videos: StreamCardVideo[] }[] {
  const map = new Map<number, StreamCardVideo[]>();
  for (const v of videos) {
    const h = jstHourOf(v.comparisonDay);
    if (h === null) continue;
    map.set(h, [...(map.get(h) ?? []), v]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, vs]) => ({ hour, videos: vs }));
}
