import { cacheLife } from "next/cache";
import {
  GcsFetchError,
  getVideoShard,
  getVTuberDetailShard,
  getVTuberIndexRaw,
  getNews,
  getNewsArchive,
  getNewsSourceScores,
  shardOf,
} from "@/lib/gcs";
import { getNewsClicks24h } from "@/lib/news-clicks";
import { buildVTuberAliasIndex, clusterNews, type NewsCluster } from "@/lib/news";
import {
  type News,
  type RawVideo,
  type RawVTuber,
  type Video,
  type VTuberDetail,
  type VTuberIndexItem,
  type VTuberOfficeGroup,
  type VTuberTabItem,
} from "@/types";
import { normalizeVTuber, normalizeVideo } from "@/lib/gcs";
import { parseDebut, parseMonthDay } from "@/lib/profile-date";
import { shortenYtThumb } from "@/lib/thumbnail";

const MAX_VIDEOS = 30;
const MAX_DAYS = 30;

function toDetail(raw: RawVTuber): VTuberDetail {
  const v = normalizeVTuber(raw);
  const birthday = parseMonthDay(v.birthday);
  const debut = parseDebut(v.debut);
  const rawVideos = (raw as { videos?: Record<string, RawVideo> }).videos;
  const videos = Object.values(rawVideos ?? {})
    .map(normalizeVideo)
    .filter((x) => x.videoId)
    .sort((a, b) => Date.parse(b.comparisonDay) - Date.parse(a.comparisonDay))
    .slice(0, MAX_VIDEOS);
  const transition = Object.entries(v.youtubeSubscriberCountTransition)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-MAX_DAYS)
    .map(([date, count]) => ({ date, count }));
  return {
    channelId: v.channelId,
    name: v.name,
    office: v.office,
    officeFlg: v.officeFlg,
    thumbnail: v.channelThumbnail,
    subscriberCount: v.subscriberCount,
    title: v.title,
    viewCount: v.viewCount,
    videoCount: v.videoCount,
    ...(birthday ? { birthday } : {}),
    ...(debut ? { debut } : {}),
    transition,
    videos,
  };
}

export function toVTuberTabItems(index: VTuberIndexItem[]): VTuberTabItem[] {
  return index.map(({ channelId, name }) => ({
    channelId,
    name,
  }));
}

export function buildOfficeGroups(
  index: Pick<VTuberIndexItem, "office" | "officeFlg" | "thumbnail">[],
): VTuberOfficeGroup[] {
  const groups: VTuberOfficeGroup[] = [];
  for (const item of index) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.office) {
      last.count += 1;
      if (!last.thumbnail && item.officeFlg && item.thumbnail) {
        last.thumbnail = shortenYtThumb(item.thumbnail);
      }
      continue;
    }
    groups.push({
      name: item.office,
      count: 1,
      ...(item.officeFlg && item.thumbnail
        ? { thumbnail: shortenYtThumb(item.thumbnail) }
        : {}),
    });
  }
  return groups;
}

export function countVTuberIndex(index: VTuberIndexItem[]): {
  officeCount: number;
  memberCount: number;
} {
  return {
    officeCount: new Set(index.map((item) => item.office)).size,
    memberCount: index.length,
  };
}

export async function getCachedVTuberPageData(): Promise<{
  tabItems: VTuberTabItem[];
  officeGroups: VTuberOfficeGroup[];
  directoryItems: VTuberIndexItem[];
  officeCount: number;
  memberCount: number;
}> {
  "use cache";
  cacheLife("hours");
  const { index } = await loadVTuberIndex();
  const counts = countVTuberIndex(index);
  return {
    tabItems: toVTuberTabItems(index),
    officeGroups: buildOfficeGroups(index),
    directoryItems: index,
    officeCount: counts.officeCount,
    memberCount: counts.memberCount,
  };
}

export async function loadVTuberIndex(): Promise<{
  index: VTuberIndexItem[];
  latestTransitionDate: Record<string, string>;
}> {
  "use cache";
  cacheLife("hours");
  const raw = await getVTuberIndexRaw();
  const index: VTuberIndexItem[] = [];
  const latestTransitionDate: Record<string, string> = {};
  // 事務所の初出順 → 各事務所内で公式アカウントを先頭に
  for (const list of Object.values(raw)) {
    const members = list
      .map((item) => ({ vtuber: normalizeVTuber(item), latest: item.latestTransitionDate }))
      .filter(({ vtuber }) => vtuber.channelId)
      .sort((a, b) => Number(b.vtuber.officeFlg) - Number(a.vtuber.officeFlg));
    for (const { vtuber, latest } of members) {
      if (latest) {
        latestTransitionDate[vtuber.channelId] = latest;
      }
      index.push({
        channelId: vtuber.channelId,
        name: vtuber.name,
        office: vtuber.office,
        officeFlg: vtuber.officeFlg,
        thumbnail: vtuber.channelThumbnail,
        subscriberCount: vtuber.subscriberCount,
      });
    }
  }
  return { index, latestTransitionDate };
}

export const loadVTubers = loadVTuberIndex;

export async function getVTuberDetail(
  channelId: string,
): Promise<VTuberDetail | null> {
  const raw = await getVTuberIndexRaw();
  const indexItem = Object.values(raw)
    .flat()
    .find((item) => normalizeVTuber(item).channelId === channelId);
  if (!indexItem) return null;
  const shard = await getVTuberDetailShard(shardOf(channelId));
  const shardEntry = shard[channelId];
  const merged: RawVTuber & { videos?: Record<string, RawVideo> } = {
    ...indexItem,
    videos: shardEntry?.videos ?? {},
    ...(shardEntry?.youtubeSubscriberCountTransition
      ? {
          youtubeSubscriberCountTransition:
            shardEntry.youtubeSubscriberCountTransition,
        }
      : {}),
  };
  return toDetail(merged);
}

export async function getCachedVTuberDetail(
  channelId: string,
): Promise<VTuberDetail | null> {
  "use cache";
  cacheLife("hours");
  return getVTuberDetail(channelId);
}

export async function getCachedVTuberRanks(channelId: string): Promise<{
  overall: number;
  total: number;
  inOffice: number;
  officeTotal: number;
} | null> {
  "use cache";
  cacheLife("hours");
  const { index } = await loadVTuberIndex();
  const sorted = [...index].sort((a, b) => b.subscriberCount - a.subscriberCount);
  const overallIndex = sorted.findIndex((item) => item.channelId === channelId);
  if (overallIndex < 0) return null;
  const target = sorted[overallIndex];
  const inOfficeList = sorted.filter((item) => item.office === target.office);
  const inOfficeIndex = inOfficeList.findIndex(
    (item) => item.channelId === channelId,
  );
  if (inOfficeIndex < 0) return null;
  return {
    overall: overallIndex + 1,
    total: sorted.length,
    inOffice: inOfficeIndex + 1,
    officeTotal: inOfficeList.length,
  };
}

export async function getCachedNearbyVTubers(
  channelId: string,
  limit = 12,
): Promise<VTuberIndexItem[]> {
  "use cache";
  cacheLife("hours");
  const { index } = await loadVTuberIndex();
  const sorted = [...index].sort((a, b) => b.subscriberCount - a.subscriberCount);
  const center = sorted.findIndex((item) => item.channelId === channelId);
  if (center < 0 || sorted.length <= 1 || limit <= 0) return [];
  const maxCount = Math.min(limit, sorted.length - 1);
  const rangeLength = maxCount + 1;
  let start = center - Math.floor(maxCount / 2);
  let end = start + rangeLength;
  if (start < 0) {
    end += -start;
    start = 0;
  }
  if (end > sorted.length) {
    start -= end - sorted.length;
    end = sorted.length;
    if (start < 0) start = 0;
  }
  return sorted
    .slice(start, end)
    .filter((item) => item.channelId !== channelId)
    .slice(0, maxCount);
}

export async function getVideosByIds(ids: string[]): Promise<Video[]> {
  const uniqueShards = Array.from(new Set(ids.map((id) => shardOf(id))));
  const shardEntries = await Promise.all(
    uniqueShards.map(async (shard) => [shard, await getVideoShard(shard)] as const),
  );
  const shardMap = new Map<string, Record<string, RawVideo>>(shardEntries);
  const out: Video[] = [];
  for (const id of ids) {
    const raw = shardMap.get(shardOf(id))?.[id];
    if (!raw) continue;
    const normalized = normalizeVideo(raw);
    if (!normalized.videoId) continue;
    out.push(normalized);
  }
  return out;
}

export async function getCachedNewsClusters(): Promise<NewsCluster[] | null> {
  "use cache";
  cacheLife({ stale: 600, revalidate: 600, expire: 3600 });
  let news;
  try {
    news = await getNews();
  } catch (error) {
    if (error instanceof GcsFetchError) return null;
    throw error;
  }
  const { index } = await loadVTuberIndex();
  const aliases = buildVTuberAliasIndex(index);
  const clicks = await getNewsClicks24h();
  const sourceScores = await getNewsSourceScores();
  return clusterNews(news, { now: Date.now(), aliases, clicks, sourceScores });
}

function jstArchiveMonth(now: Date): string {
  const year = now.toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  });
  const month = now.toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
  });
  return `${year}-${month}`;
}

function addMonths(month: string, delta: number): string {
  const [year, mm] = month.split("-").map(Number);
  if (!year || !mm) return month;
  const d = new Date(Date.UTC(year, mm - 1 + delta, 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function dedupeNewsByUrl(items: News[]): News[] {
  const seen = new Set<string>();
  const deduped: News[] = [];
  for (const item of items) {
    const url = item.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    deduped.push(item);
  }
  return deduped;
}

async function getCachedRelatedNewsClusters(): Promise<NewsCluster[] | null> {
  "use cache";
  cacheLife({ stale: 600, revalidate: 600, expire: 3600 });
  let news: News[];
  try {
    news = await getNews();
  } catch (error) {
    if (error instanceof GcsFetchError) return null;
    throw error;
  }
  const currentMonth = jstArchiveMonth(new Date());
  const previousMonth = addMonths(currentMonth, -1);
  const [currentArchive, previousArchive] = await Promise.all([
    getNewsArchive(currentMonth),
    getNewsArchive(previousMonth),
  ]);
  const mergedNews = dedupeNewsByUrl(news.concat(currentArchive, previousArchive));
  const { index } = await loadVTuberIndex();
  const aliases = buildVTuberAliasIndex(index);
  const sourceScores = await getNewsSourceScores();
  return clusterNews(mergedNews, {
    now: Date.now(),
    aliases,
    sourceScores,
    maxAgeDays: 60,
  });
}

export async function getCachedVTuberRelatedNews(
  channelId: string,
  limit = 5,
): Promise<NewsCluster[] | null> {
  const clusters = await getCachedRelatedNewsClusters();
  if (!clusters) return null;
  return clusters
    .filter((cluster) =>
      cluster.vtubers.some((vtuber) => vtuber.channelId === channelId),
    )
    .slice(0, Math.max(0, limit));
}
