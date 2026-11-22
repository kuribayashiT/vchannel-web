import { cacheLife } from "next/cache";
import {
  GcsFetchError,
  getVTuberDetailShard,
  getVTuberIndexRaw,
  getVideoShard,
  getNews,
  getNewsArchive,
  getNewsSourceScores,
  shardOf,
} from "@/lib/gcs";
import { getNewsClicks24h } from "@/lib/news-clicks";
import { buildVTuberAliasIndex, clusterNews, type NewsCluster } from "@/lib/news";
import {
  GCS_FILES,
  type News,
  type RawOfficeDataList,
  type RawVideo,
  type RawVTuber,
  type Video,
  type VTuberDetail,
  type VTuberIndexItem,
  type VTuberOfficeGroup,
  type VTuberTabItem,
} from "@/types";
import { fetchGcsJson, normalizeVTuber, normalizeVideo } from "@/lib/gcs";
import { parseDebut, parseMonthDay } from "@/lib/profile-date";
import { shortenYtThumb } from "@/lib/thumbnail";

/**
 * officedataList.json(約19MB) / allvideos.json(約16MB) は Next.js の fetch キャッシュ上限(2MB)を
 * 超えるため、サーバーインスタンス内で 1 時間メモリ保持する（Route Handler 専用）。
 */
const TTL_MS = 3_600_000;

function memo<T>(load: () => Promise<T>) {
  let entry: { at: number; value: Promise<T> } | null = null;
  return () => {
    if (!entry || Date.now() - entry.at > TTL_MS) {
      const value = load();
      entry = { at: Date.now(), value };
      // 失敗結果は保持しない
      value.catch(() => {
        entry = null;
      });
    }
    return entry.value;
  };
}

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

export const loadVTubers = memo(async () => {
  const raw = await fetchGcsJson<RawOfficeDataList>(GCS_FILES.officeData, 0);
  const details = new Map<string, VTuberDetail>();
  const index: VTuberIndexItem[] = [];
  // 事務所の初出順 → 各事務所内で公式アカウントを先頭に
  for (const list of Object.values(raw)) {
    const members = list
      .map(toDetail)
      .filter((d) => d.channelId)
      .sort((a, b) => Number(b.officeFlg) - Number(a.officeFlg));
    for (const d of members) {
      details.set(d.channelId, d);
      index.push({
        channelId: d.channelId,
        name: d.name,
        office: d.office,
        officeFlg: d.officeFlg,
        thumbnail: d.thumbnail,
        subscriberCount: d.subscriberCount,
      });
    }
  }
  return { details, index };
});

export async function loadVTuberIndex(): Promise<{
  index: VTuberIndexItem[];
  latestTransitionDate: Record<string, string>;
}> {
  "use cache";
  cacheLife("hours");
  const raw = await getVTuberIndexRaw();
  const index: VTuberIndexItem[] = [];
  const latestTransitionDate: Record<string, string> = {};
  for (const list of Object.values(raw)) {
    const members = list
      .map((item) => ({
        raw: item,
        normalized: normalizeVTuber(item),
      }))
      .filter((item) => item.normalized.channelId)
      .sort(
        (a, b) => Number(b.normalized.officeFlg) - Number(a.normalized.officeFlg),
      );
    for (const { raw: item, normalized } of members) {
      index.push({
        channelId: normalized.channelId,
        name: normalized.name,
        office: normalized.office,
        officeFlg: normalized.officeFlg,
        thumbnail: normalized.channelThumbnail,
        subscriberCount: normalized.subscriberCount,
      });
      const latest = item.latestTransitionDate?.trim();
      if (latest) latestTransitionDate[normalized.channelId] = latest;
    }
  }
  return { index, latestTransitionDate };
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

export async function getVTuberDetail(
  channelId: string,
): Promise<VTuberDetail | null> {
  const rawIndex = await getVTuberIndexRaw();
  let indexItem: RawVTuber | null = null;
  for (const list of Object.values(rawIndex)) {
    const found = list.find((item) => normalizeVTuber(item).channelId === channelId);
    if (found) {
      indexItem = found;
      break;
    }
  }
  if (!indexItem) return null;

  const shard = await getVTuberDetailShard(shardOf(channelId));
  const shardEntry = shard[channelId];
  const detailSource: RawVTuber = shardEntry
    ? { ...indexItem, ...shardEntry }
    : { ...indexItem, videos: {} };
  return toDetail(detailSource);
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

export const loadAllVideos = memo(async () => {
  const raw = await fetchGcsJson<RawVideo[]>(GCS_FILES.allVideos, 0);
  const map = new Map<string, Video>();
  for (const r of Array.isArray(raw) ? raw : []) {
    const v = normalizeVideo(r);
    if (v.videoId) map.set(v.videoId, v);
  }
  return map;
});

export async function getVideosByIds(ids: string[]): Promise<Video[]> {
  if (ids.length === 0) return [];
  const shardToIds = new Map<string, string[]>();
  for (const id of ids) {
    if (!id) continue;
    const shard = shardOf(id);
    const current = shardToIds.get(shard);
    if (current) {
      current.push(id);
      continue;
    }
    shardToIds.set(shard, [id]);
  }

  const shardEntries = await Promise.all(
    Array.from(shardToIds.keys()).map(async (shard) => [
      shard,
      await getVideoShard(shard),
    ] as const),
  );
  const shardMap = new Map<string, Record<string, RawVideo>>(shardEntries);

  const videos: Video[] = [];
  for (const id of ids) {
    if (!id) continue;
    const raw = shardMap.get(shardOf(id))?.[id];
    if (!raw) continue;
    const video = normalizeVideo(raw);
    if (!video.videoId) continue;
    videos.push(video);
  }
  return videos;
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
