import {
  GCS_FILES,
  type EventList,
  type News,
  type NumLike,
  type OfficeDataList,
  type RawVideo,
  type RawSubscriberTransitionList,
  type RawVTuber,
  type SubscriberTransitionMap,
  type TwitterFollowerRankingItem,
  type Video,
  type VideoCountRankingItem,
  type VTuber,
  type WeeklyLiveViewRankingItem,
  type YoutubeSubscriberRankingItem,
} from "@/types";

export const GCS_BASE_URL =
  process.env.GCS_BASE_URL ??
  "https://storage.googleapis.com/vtuber-335811.appspot.com";

/** 再検証間隔（秒）。仕様 §6: 通常 1 時間、ライブ関連は 60 秒周期で更新 */
export const REVALIDATE = {
  default: 3600,
  live: 60,
} as const;

export const SHARD_COUNT = 64;

export function shardOf(id: string): string {
  const sum = Array.from(id).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return String(sum % SHARD_COUNT).padStart(2, "0");
}

export const SPLIT_FILES = {
  vtuberIndex: "vtuberIndex.json",
  streamVideos: "streamVideos.json",
  vtuberDetail: (shard: string) => `vtuberDetail/${shard}.json`,
  videoShard: (shard: string) => `videoShards/${shard}.json`,
} as const;

export type RawVTuberIndexItem = RawVTuber & { latestTransitionDate?: string };

export type RawVTuberDetailShard = Record<
  string,
  {
    videos?: Record<string, RawVideo>;
    youtubeSubscriberCountTransition?: Record<string, NumLike>;
  }
>;

export class GcsFetchError extends Error {
  constructor(
    public readonly file: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(
      status
        ? `GCS fetch failed: ${file} (HTTP ${status})`
        : `GCS fetch failed: ${file}`,
      options,
    );
    this.name = "GcsFetchError";
  }
}

/** GCS 公開 JSON を取得する共通関数 */
export async function fetchGcsJson<T = unknown>(
  file: string,
  revalidate: number | "no-store" = REVALIDATE.default,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(
      `${GCS_BASE_URL}/${file}`,
      revalidate === "no-store"
        ? { cache: "no-store" }
        : { next: { revalidate } },
    );
  } catch (e) {
    throw new GcsFetchError(file, undefined, { cause: e });
  }
  if (!res.ok) throw new GcsFetchError(file, res.status);
  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new GcsFetchError(file, res.status, { cause: e });
  }
}

// ---------- 正規化ヘルパー ----------

export function toNumber(v: NumLike | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toNumberRecord(
  r: Record<string, NumLike> | undefined,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(r ?? {}).map(([k, v]) => [k, toNumber(v)]),
  );
}

/** 配列 / 旧形式 `{ jsonData: [...] }` の両対応 */
function toArray<T>(data: unknown): T[] {
  const d =
    data && typeof data === "object" && "jsonData" in data
      ? (data as { jsonData: unknown }).jsonData
      : data;
  if (Array.isArray(d)) return d as T[];
  return d && typeof d === "object" ? (Object.values(d) as T[]) : [];
}

export function normalizeVTuber(r: RawVTuber): VTuber {
  return {
    channelId: r.channeID ?? r.channelId ?? r.youtubeChId ?? "",
    name: r.name ?? "",
    office: r.office ?? "",
    officeKey: r.officeKey ?? "",
    officeFlg: r.officeFlg === true,
    officeName: r.officeName ?? "",
    channelThumbnail: r.channelThumbnail ?? "",
    title: r.title ?? "",
    subscriberCount: toNumber(r.youtubeSubscriberCount ?? r.subscriberCount),
    viewCount: toNumber(r.viewCount),
    videoCount: toNumber(r.videoCount),
    youtubeSubscriberCountTransition: toNumberRecord(
      r.youtubeSubscriberCountTransition,
    ),
    twitterName: r.twitterName ?? "",
    twitterId: r.twitterID ?? "",
    twitterFollowerCount: toNumber(r.twitterFollowerCount),
    twitterSubscriberCountTransition: toNumberRecord(
      r.twitterSubscriberCountTransition,
    ),
    birthday: r.birthday ?? "",
    debut: r.debut ?? "",
    createdAt: r.createdAt ?? "",
    updateTime: r.updateTime ?? "",
    order: toNumber(r.order),
  };
}

export function normalizeVideo(r: RawVideo): Video {
  return {
    videoId: r.videoID ?? r.videoId ?? "",
    title: r.title ?? "",
    channelId: r.channelId ?? "",
    channelTitle: r.channelTitle ?? "",
    channelThumbnail: r.channelThumbnail ?? "",
    thumbnail: r.thumbnail ?? "",
    office: r.office ?? "",
    officeKey: r.officeKey ?? "",
    concurrentViewers: toNumber(r.concurrent_viewers),
    scheduledStartTime: r.scheduledStartTime ?? "",
    actualStartTime: r.actualStartTime ?? "",
    actualEndTime: r.actualEndTime ?? "",
    comparisonDay: r.comparisonDay ?? "",
    publishedAt: r.publishedAt ?? "",
  };
}

type RankingRow = {
  channeID?: string;
  channelId?: string;
  youtubeChId?: string;
  name?: string;
  office?: string;
  channelThumbnail?: string;
  youtubeSubscriberCount?: NumLike;
  twitterFollowerCount?: NumLike;
  videoCount?: NumLike;
};

function rankingBase(r: RankingRow) {
  return {
    channelId: r.channeID ?? r.channelId ?? r.youtubeChId ?? "",
    name: r.name ?? "",
    office: r.office ?? "",
    channelThumbnail: r.channelThumbnail ?? "",
  };
}

// ---------- 型付き取得関数 ----------

export async function getOfficeDataList(): Promise<OfficeDataList> {
  const raw = await getVTuberIndexRaw();
  return Object.fromEntries(
    Object.entries(raw).map(([office, list]) => [
      office,
      list.map(normalizeVTuber),
    ]),
  );
}

export async function getLiveVideoList(): Promise<Video[]> {
  const raw = await fetchGcsJson(GCS_FILES.liveVideos, "no-store");
  return toArray<RawVideo>(raw).map(normalizeVideo);
}

export async function getAllVideos(): Promise<Video[]> {
  const raw = await fetchGcsJson(GCS_FILES.allVideos);
  return toArray<RawVideo>(raw).map(normalizeVideo);
}

export async function getVTuberIndexRaw(): Promise<
  Record<string, RawVTuberIndexItem[]>
> {
  return fetchGcsJson<Record<string, RawVTuberIndexItem[]>>(
    SPLIT_FILES.vtuberIndex,
  );
}

export async function getVTuberDetailShard(
  shard: string,
): Promise<RawVTuberDetailShard> {
  return fetchGcsJson<RawVTuberDetailShard>(SPLIT_FILES.vtuberDetail(shard));
}

export async function getVideoShard(
  shard: string,
): Promise<Record<string, RawVideo>> {
  return fetchGcsJson<Record<string, RawVideo>>(SPLIT_FILES.videoShard(shard));
}

export async function getStreamVideoList(): Promise<Video[]> {
  const raw = await fetchGcsJson(SPLIT_FILES.streamVideos, 300);
  return toArray<RawVideo>(raw).map(normalizeVideo);
}

export async function getNews(): Promise<News[]> {
  return toArray<News>(await fetchGcsJson(GCS_FILES.news));
}

export async function getNewsArchive(month: string): Promise<News[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  try {
    return toArray<News>(
      await fetchGcsJson(`news/archive/${month}.json`, REVALIDATE.default),
    );
  } catch (error) {
    if (error instanceof GcsFetchError && error.status === 404) return [];
    throw error;
  }
}

export async function getNewsSourceScores(): Promise<
  Record<string, { adCount: number; sampled: number; checkedAt: string }>
> {
  try {
    const raw = await fetchGcsJson<unknown>("newsSourceScores.json");
    if (!raw || typeof raw !== "object") return {};
    const entries = Object.entries(raw as Record<string, unknown>).flatMap(
      ([host, value]) => {
        if (!value || typeof value !== "object") return [];
        const adCount = Number((value as { adCount?: unknown }).adCount);
        const sampled = Number((value as { sampled?: unknown }).sampled);
        const checkedAt = String(
          (value as { checkedAt?: unknown }).checkedAt ?? "",
        ).trim();
        if (
          !Number.isFinite(adCount) ||
          !Number.isFinite(sampled) ||
          !checkedAt
        ) {
          return [];
        }
        return [[host, { adCount, sampled, checkedAt }] as const];
      },
    );
    return Object.fromEntries(entries);
  } catch (error) {
    if (error instanceof GcsFetchError && error.status === 404) return {};
    throw error;
  }
}

export async function getEventList(): Promise<EventList> {
  return toArray<EventList[number]>(await fetchGcsJson(GCS_FILES.events));
}

export async function getYoutubeSubscriberRanking(): Promise<
  YoutubeSubscriberRankingItem[]
> {
  const raw = toArray<RankingRow>(await fetchGcsJson(GCS_FILES.rankingYoutube));
  return raw.map((r) => ({
    ...rankingBase(r),
    youtubeSubscriberCount: toNumber(r.youtubeSubscriberCount),
  }));
}

export async function getTwitterFollowerRanking(): Promise<
  TwitterFollowerRankingItem[]
> {
  const raw = toArray<RankingRow>(await fetchGcsJson(GCS_FILES.rankingTwitter));
  return raw.map((r) => ({
    ...rankingBase(r),
    twitterFollowerCount: toNumber(r.twitterFollowerCount),
  }));
}

export async function getWeeklyLiveViewRanking(): Promise<
  WeeklyLiveViewRankingItem[]
> {
  const raw = await fetchGcsJson(GCS_FILES.weeklyLiveView, REVALIDATE.live);
  return toArray<RawVideo>(raw).map(normalizeVideo);
}

export async function getVideoCountRanking(): Promise<VideoCountRankingItem[]> {
  const raw = toArray<RankingRow>(
    await fetchGcsJson(GCS_FILES.rankingVideoCount),
  );
  return raw.map((r) => ({
    ...rankingBase(r),
    videoCount: toNumber(r.videoCount),
  }));
}

/** YYYYMMDD 形式の日付キーのみ採用し、日付昇順に並べる */
export async function getSubscriberTransitionList(): Promise<SubscriberTransitionMap> {
  const raw = toArray<RawSubscriberTransitionList[number]>(
    // 2MB 超のため Next.js fetch キャッシュへ載せない（集計済み結果は呼び出し側で "use cache" 保持）
    await fetchGcsJson(GCS_FILES.subscriberTransition, 0),
  );
  const out: SubscriberTransitionMap = {};
  for (const obj of raw) {
    for (const [channelId, entries] of Object.entries(obj)) {
      if (!Array.isArray(entries)) continue;
      const points = entries.flatMap((e) =>
        Object.entries(e ?? {})
          .filter(([date]) => /^\d{8}$/.test(date))
          .map(([date, count]) => ({ date, count: toNumber(count) })),
      );
      points.sort((a, b) => a.date.localeCompare(b.date));
      if (points.length > 0) out[channelId] = points;
    }
  }
  return out;
}
