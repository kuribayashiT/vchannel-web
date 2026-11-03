import {
  GCS_FILES,
  type EventList,
  type GcsFileName,
  type News,
  type NumLike,
  type OfficeDataList,
  type RawOfficeDataList,
  type RawVideo,
  type RawVTuber,
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

/** 再検証間隔（秒）。仕様 §6: 通常 1 時間、ライブ関連は 5 分周期で更新 */
export const REVALIDATE = {
  default: 3600,
  live: 300,
} as const;

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
  file: GcsFileName,
  revalidate: number = REVALIDATE.default,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GCS_BASE_URL}/${file}`, { next: { revalidate } });
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

/**
 * officedataList.json は約 25MB で fetch キャッシュ上限(2MB)を超えるため
 * revalidate: 0 で取得する。呼び出し側で "use cache" 等により結果を保持すること。
 */
export async function getOfficeDataList(): Promise<OfficeDataList> {
  const raw = await fetchGcsJson<RawOfficeDataList>(GCS_FILES.officeData, 0);
  return Object.fromEntries(
    Object.entries(raw).map(([office, list]) => [
      office,
      list.map(normalizeVTuber),
    ]),
  );
}

export async function getLiveVideoList(): Promise<Video[]> {
  const raw = await fetchGcsJson(GCS_FILES.liveVideos, REVALIDATE.live);
  return toArray<RawVideo>(raw).map(normalizeVideo);
}

export async function getAllVideos(): Promise<Video[]> {
  const raw = await fetchGcsJson(GCS_FILES.allVideos);
  return toArray<RawVideo>(raw).map(normalizeVideo);
}

export async function getNews(): Promise<News[]> {
  return toArray<News>(await fetchGcsJson(GCS_FILES.news));
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
