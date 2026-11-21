import "server-only";
import { getCachedSortedEventsMapByDateSlug } from "@/lib/events-data";
import { eventLabel, formatDateSlug, todayJstParts } from "@/lib/events";
import { fetchGcsJson, getWeeklyLiveViewRanking, normalizeVideo } from "@/lib/gcs";
import { getGrowthData } from "@/lib/growth-data";
import { getCachedVTuberPageData } from "@/lib/server-data";
import { GCS_FILES, type RawVideo, type Video } from "@/types";

/**
 * 週刊特集（scripts/content/write-weekly-feature.mjs）の材料。FRONTEND_SPEC.md 5.12.3
 * 記事に書いてよい事実はここに入っているものだけ、という前提で作る。
 */
export const FEATURE_THEMES = ["growth", "events", "live"] as const;
export type FeatureTheme = (typeof FEATURE_THEMES)[number];

const GROWTH_PICKS = 6;
const RATE_PICKS = 6;
const RATE_MIN_SUBSCRIBERS = 10_000;
const VIDEOS_PER_CHANNEL = 3;

function ymdToIso(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function jstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function videoDate(v: Video): string {
  return jstDate(v.actualStartTime || v.scheduledStartTime || v.publishedAt);
}

/** 期間内に公開・配信された動画を、チャンネルごとに再生数の多い順で数本 */
async function recentVideosByChannel(
  channelIds: Set<string>,
  from: string,
  to: string,
) {
  // 再生数は normalizeVideo() で落ちるので、元の JSON から読む（約 18MB。ジョブ内で 1 回だけ）
  const raw = await fetchGcsJson<(RawVideo & { viewCount?: unknown })[]>(
    GCS_FILES.allVideos,
    0,
  );
  const byChannel = new Map<string, { title: string; date: string; viewCount: number }[]>();
  for (const r of Array.isArray(raw) ? raw : []) {
    const v = normalizeVideo(r);
    if (!channelIds.has(v.channelId)) continue;
    const date = videoDate(v);
    if (!date || date < from || date > to) continue;
    const list = byChannel.get(v.channelId) ?? [];
    list.push({ title: v.title, date, viewCount: Number(r.viewCount ?? 0) || 0 });
    byChannel.set(v.channelId, list);
  }
  for (const [id, list] of byChannel) {
    byChannel.set(
      id,
      list.sort((a, b) => b.viewCount - a.viewCount).slice(0, VIDEOS_PER_CHANNEL),
    );
  }
  return byChannel;
}

async function growthMaterials() {
  const { week } = await getGrowthData();
  const from = ymdToIso(week.from);
  const to = ymdToIso(week.to);
  const byGrowth = [...week.items]
    .sort((a, b) => b.growth - a.growth)
    .slice(0, GROWTH_PICKS);
  const byRate = week.items
    .filter((i) => i.current >= RATE_MIN_SUBSCRIBERS)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, RATE_PICKS);
  const picked = new Map([...byGrowth, ...byRate].map((i) => [i.channelId, i]));
  const videos = await recentVideosByChannel(new Set(picked.keys()), from, to);
  const growthRank = new Map(
    [...week.items].sort((a, b) => b.growth - a.growth).map((i, n) => [i.channelId, n + 1]),
  );

  return {
    period: { from, to },
    note: "週間（期間の初めと終わりの差）の登録者の増加。YouTube の公開値は上3桁に丸められている。",
    channelsCounted: week.items.length,
    channels: [...picked.values()].map((i) => ({
      channelId: i.channelId,
      name: i.name,
      office: i.office || "個人",
      subscribersAtEnd: i.current,
      growth: i.growth,
      ratePercent: Math.round(i.rate * 10) / 10,
      growthRank: growthRank.get(i.channelId) ?? null,
      inTopByGrowth: byGrowth.some((g) => g.channelId === i.channelId),
      inTopByRate: byRate.some((g) => g.channelId === i.channelId),
      dailySubscribers: i.spark,
      videosInPeriod: videos.get(i.channelId) ?? [],
    })),
  };
}

async function eventsMaterials() {
  const { y, m, d } = todayJstParts();
  const [eventsByDate, pageData] = await Promise.all([
    getCachedSortedEventsMapByDateSlug(),
    getCachedVTuberPageData(),
  ]);
  const subscribers = new Map(
    pageData.directoryItems.map((i) => [i.channelId, i.subscriberCount]),
  );
  const days = [];
  // 明日から 7 日分（記事は週の初めに出るので「今週のお祝い」になる）
  for (let n = 1; n <= 7; n += 1) {
    const date = new Date(Date.UTC(y, m - 1, d + n));
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const slug = formatDateSlug(month, day);
    const events = eventsByDate.get(slug) ?? [];
    const year = date.getUTCFullYear();
    days.push({
      date: date.toISOString().slice(0, 10),
      eventsPage: `/events/${slug}`,
      birthdayCount: events.filter((e) => e.eventType === "birthday").length,
      anniversaryCount: events.filter((e) => e.eventType === "createAt").length,
      notable: events.slice(0, 6).map((e) => ({
        channelId: e.channelId,
        name: e.name,
        office: e.office || "個人",
        what: eventLabel(e, year),
        debutDate: e.eventType === "createAt" ? e.createdAt : undefined,
        subscriberCount: subscribers.get(e.channelId) ?? null,
      })),
    });
  }
  return {
    period: { from: days[0].date, to: days[days.length - 1].date },
    note: "誕生日は公表されているもの、周年は YouTube チャンネルの開設日から数えている。",
    days,
  };
}

async function liveMaterials() {
  const videos = (await getWeeklyLiveViewRanking())
    .filter((v) => v.concurrentViewers > 0)
    .sort((a, b) => b.concurrentViewers - a.concurrentViewers);
  const top = videos.slice(0, 15);
  const officeCounts = new Map<string, number>();
  for (const v of top) {
    const office = v.office || "個人";
    officeCounts.set(office, (officeCounts.get(office) ?? 0) + 1);
  }
  const dates = top.map(videoDate).filter(Boolean).sort();
  return {
    period: { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null },
    note: "直近 1 週間の配信の最大同時接続数。アーカイブの再生数ではない。",
    videos: top.map((v, i) => ({
      rank: i + 1,
      channelId: v.channelId,
      channelTitle: v.channelTitle,
      office: v.office || "個人",
      title: v.title,
      date: videoDate(v),
      concurrentViewers: v.concurrentViewers,
    })),
    officeCountInTop15: [...officeCounts.entries()]
      .map(([office, count]) => ({ office, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function getFeatureMaterials(theme: FeatureTheme) {
  const { y, m, d } = todayJstParts();
  const today = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const data =
    theme === "growth"
      ? await growthMaterials()
      : theme === "events"
        ? await eventsMaterials()
        : await liveMaterials();
  return { theme, today, ...data };
}
