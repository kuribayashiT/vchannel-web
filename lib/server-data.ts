import { cacheLife } from "next/cache";
import {
  GCS_FILES,
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

export function toVTuberTabItems(index: VTuberIndexItem[]): VTuberTabItem[] {
  return index.map(({ channelId, name }) => ({
    channelId,
    name,
  }));
}

export function buildOfficeGroups(
  index: Pick<VTuberIndexItem, "office">[],
): VTuberOfficeGroup[] {
  const groups: VTuberOfficeGroup[] = [];
  for (const item of index) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.office) {
      last.count += 1;
      continue;
    }
    groups.push({ name: item.office, count: 1 });
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
  const { index } = await loadVTubers();
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
  const { details } = await loadVTubers();
  return details.get(channelId) ?? null;
}

export async function getCachedVTuberDetail(
  channelId: string,
): Promise<VTuberDetail | null> {
  "use cache";
  cacheLife("hours");
  return getVTuberDetail(channelId);
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
