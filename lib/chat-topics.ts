import "server-only";
import { cacheLife } from "next/cache";
import {
  TOPIC_TTL_HOURS,
  topicIdOf,
  type ChatTopic,
} from "@/lib/chat";
import { listTopicDocs } from "@/lib/firestore";

const GCS_BASE = "https://storage.googleapis.com/vtuber-335811.appspot.com";
const MAX_TOPICS = 10;
const MAX_SUGGESTIONS = 3;

export type TopicVideo = {
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnail: string;
  isLive: boolean;
};

type VideoInfo = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnail: string;
  viewers: number;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toVideoInfo(raw: unknown): VideoInfo | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const videoId = asString(r.videoID) || asString(r.videoId);
  if (!videoId) return null;
  const viewers = Number(r.concurrent_viewers);
  return {
    videoId,
    title: asString(r.title),
    channelId: asString(r.channelId),
    channelTitle: asString(r.channelTitle),
    thumbnail: asString(r.thumbnail),
    viewers: Number.isFinite(viewers) ? viewers : 0,
  };
}

async function fetchVideoArray(
  file: string,
  init?: RequestInit,
): Promise<VideoInfo[]> {
  try {
    const res = await fetch(`${GCS_BASE}/${file}`, init);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data.flatMap((v) => {
      const info = toVideoInfo(v);
      return info ? [info] : [];
    });
  } catch {
    return [];
  }
}

/**
 * ライブ中の動画一覧（livevideoList.json）。
 * リクエストごとに GCS を読まないよう 60 秒キャッシュする（GCS の転送料対策）。
 */
export async function getLiveVideoList(): Promise<VideoInfo[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  return fetchVideoArray("livevideoList.json");
}

/** 配信タブと同じ絞り込み済みの動画一覧（streamVideos.json、約 0.5MB。共有 fetch キャッシュ） */
async function getStreamVideoList(): Promise<VideoInfo[]> {
  return fetchVideoArray("streamVideos.json", { next: { revalidate: 300 } });
}

type VideoIndex = { live: VideoInfo[]; all: VideoInfo[] };

async function loadVideoIndex(): Promise<VideoIndex> {
  const [live, all] = await Promise.all([
    getLiveVideoList(),
    getStreamVideoList(),
  ]);
  return { live, all };
}

function findVideo(index: VideoIndex, videoId: string): TopicVideo | null {
  const liveHit = index.live.find((v) => v.videoId === videoId);
  const hit = liveHit ?? index.all.find((v) => v.videoId === videoId);
  if (!hit) return null;
  return {
    title: hit.title,
    channelId: hit.channelId,
    channelTitle: hit.channelTitle,
    thumbnail: hit.thumbnail,
    isLive: liveHit !== undefined,
  };
}

/** 配信データから動画を探す。無ければ null（存在しない動画のスレを立てないため） */
export async function getTopicVideo(
  videoId: string,
): Promise<TopicVideo | null> {
  const index = await loadVideoIndex();
  return findVideo(index, videoId);
}

/**
 * 書き込みのある話題スレの一覧。最後の書き込みが TOPIC_TTL_HOURS 以内で、
 * 動画が配信データにあるものだけ。ライブ中が先、次に lastUpdated の新しい順。最大 10 件。
 */
export async function listActiveTopics(): Promise<ChatTopic[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });

  let docs: Awaited<ReturnType<typeof listTopicDocs>>;
  try {
    docs = await listTopicDocs(30);
  } catch {
    return [];
  }

  const index = await loadVideoIndex();
  const cutoff = Date.now() - TOPIC_TTL_HOURS * 60 * 60 * 1000;

  const topics: ChatTopic[] = [];
  for (const d of docs) {
    if (!d.lastUpdated) continue;
    const ms = Date.parse(d.lastUpdated);
    if (!Number.isFinite(ms) || ms < cutoff) continue;
    const video = findVideo(index, d.videoId);
    if (!video) continue;
    topics.push({
      id: d.id,
      videoId: d.videoId,
      title: video.title,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      thumbnail: video.thumbnail,
      isLive: video.isLive,
      postCount: d.postCount,
      lastUpdated: d.lastUpdated,
    });
  }

  topics.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return Date.parse(b.lastUpdated ?? "") - Date.parse(a.lastUpdated ?? "");
  });
  return topics.slice(0, MAX_TOPICS);
}

/** まだ話題スレがないライブ配信を、同時視聴者数の多い順に最大 3 件 */
export async function listTopicSuggestions(
  excludeIds: string[],
): Promise<ChatTopic[]> {
  const exclude = new Set(excludeIds);
  const live = await getLiveVideoList();
  return [...live]
    .filter((v) => !exclude.has(topicIdOf(v.videoId)))
    .sort((a, b) => b.viewers - a.viewers)
    .slice(0, MAX_SUGGESTIONS)
    .map((v) => ({
      id: topicIdOf(v.videoId),
      videoId: v.videoId,
      title: v.title,
      channelId: v.channelId,
      channelTitle: v.channelTitle,
      thumbnail: v.thumbnail,
      isLive: true,
      postCount: 0,
      lastUpdated: null,
    }));
}
