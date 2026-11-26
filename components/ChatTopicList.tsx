"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Flame, Play } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { playVideo } from "@/hooks/usePlayer";
import {
  isTopicId,
  topicIdOf,
  videoIdOfTopic,
  type ChatTopic,
} from "@/lib/chat";

const REFRESH_MS = 60_000;
const COLLAPSED_COUNT = 3;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** API のレスポンス 1 件を ChatTopic にする。形が合わなければ null */
export function parseChatTopic(raw: unknown): ChatTopic | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rawVideoId = str(r.videoId);
  const id = str(r.id) || (rawVideoId ? topicIdOf(rawVideoId) : "");
  if (!isTopicId(id)) return null;
  const postCount = Number(r.postCount);
  return {
    id,
    videoId: rawVideoId || videoIdOfTopic(id),
    title: str(r.title),
    channelId: str(r.channelId),
    channelTitle: str(r.channelTitle),
    thumbnail: str(r.thumbnail),
    isLive: r.isLive === true,
    postCount: Number.isFinite(postCount) ? postCount : 0,
    lastUpdated: typeof r.lastUpdated === "string" ? r.lastUpdated : null,
  };
}

function toTopics(v: unknown): ChatTopic[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const t = parseChatTopic(x);
    return t ? [t] : [];
  });
}

/** `/api/chat/topics?id=…` のレスポンスから話題スレを取り出す（見つからなければ null） */
export function parseTopicLookup(raw: unknown): ChatTopic | null {
  const direct = parseChatTopic(raw);
  if (direct) return direct;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return parseChatTopic(r.topic) ?? toTopics(r.topics)[0] ?? null;
}

type TopicData = { topics: ChatTopic[]; suggestions: ChatTopic[] };

function parseTopicResponse(raw: unknown): TopicData {
  if (Array.isArray(raw)) return { topics: toTopics(raw), suggestions: [] };
  if (!raw || typeof raw !== "object") return { topics: [], suggestions: [] };
  const r = raw as Record<string, unknown>;
  return { topics: toTopics(r.topics), suggestions: toTopics(r.suggestions) };
}

function relativeTime(iso: string | null, now: number): string {
  if (!iso || !now) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(Math.floor((now - t) / 1000), 0);
  if (sec < 60) return "たった今";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  return `${Math.floor(hour / 24)}日前`;
}

function LiveBadge() {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:bg-red-950/40 dark:text-red-300">
      🔴 配信中
    </span>
  );
}

/** 話題スレを開いたときの先頭ヘッダー（配信のサムネ・タイトル・チャンネル・再生ボタン） */
export function ChatTopicHeader({ topic }: { topic: ChatTopic }) {
  return (
    <div className="mb-3 flex gap-3 rounded-2xl border border-violet-200 bg-white p-2 shadow-sm dark:border-violet-900/50 dark:bg-zinc-900">
      <SafeImage
        src={topic.thumbnail}
        alt=""
        variant="thumbnail"
        className="aspect-video w-20 shrink-0 self-start rounded-md object-cover"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="line-clamp-2 text-sm font-semibold">{topic.title}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
          {topic.channelId ? (
            <Link
              href={`/vtuber/${topic.channelId}`}
              className="min-w-0 truncate text-blue-600 hover:underline dark:text-blue-400"
            >
              {topic.channelTitle || "チャンネル"}
            </Link>
          ) : (
            <span className="min-w-0 truncate">{topic.channelTitle}</span>
          )}
          {topic.isLive && <LiveBadge />}
        </div>
        <button
          type="button"
          onClick={() => playVideo(topic.videoId)}
          className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:brightness-110"
        >
          <Play size={14} aria-hidden />
          ここで再生
        </button>
      </div>
    </div>
  );
}

type Item = { topic: ChatTopic; suggestion: boolean };

export function ChatTopicList({
  selectedId,
  onSelect,
  refreshKey,
}: {
  /** 選択中の話題スレの id（事務所スレッドを選んでいるときは null） */
  selectedId: string | null;
  onSelect: (topic: ChatTopic) => void;
  /** 値が変わるたびに再取得する */
  refreshKey: number;
}) {
  const [data, setData] = useState<TopicData | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/topics", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const json: unknown = await res.json();
      setData(parseTopicResponse(json));
      setNow(Date.now());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // 初回取得と 60 秒ごとの再取得。タブが非表示の間は止め、戻ったらすぐ 1 回取得する
  useEffect(() => {
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
    const start = () => {
      if (timer === undefined) {
        timer = window.setInterval(() => void load(), REFRESH_MS);
      }
    };
    void load();
    if (document.visibilityState !== "hidden") start();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        stop();
        void load();
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [load]);

  // 最初の投稿など、親からの再取得依頼
  useEffect(() => {
    if (refreshKey > 0) void load();
  }, [refreshKey, load]);

  const items: Item[] = data
    ? data.topics.length > 0
      ? data.topics.map((topic) => ({ topic, suggestion: false }))
      : data.suggestions.map((topic) => ({ topic, suggestion: true }))
    : [];
  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);
  const hiddenCount = items.length - visible.length;

  return (
    <section aria-label="いま話題のスレ">
      <h2 className="mb-2 flex items-center gap-1 text-xs font-medium text-zinc-500">
        <Flame size={16} aria-hidden className="text-orange-500" />
        いま話題のスレ
      </h2>
      {!data && !failed && <p className="text-sm text-zinc-500">読み込み中…</p>}
      {!data && failed && (
        <p className="text-sm text-zinc-500">話題のスレを読み込めませんでした</p>
      )}
      {data && items.length === 0 && (
        <p className="text-xs text-zinc-500">
          配信中の配信の「この配信のスレ」から、話題スレを立てられます
        </p>
      )}
      {items.length > 0 && (
        <ul className="space-y-2">
          {visible.map(({ topic, suggestion }) => {
            const selected = selectedId === topic.id;
            const rel = relativeTime(topic.lastUpdated, now);
            return (
              <li key={topic.id}>
                <button
                  type="button"
                  onClick={() => onSelect(topic)}
                  aria-pressed={selected}
                  className={`flex w-full gap-3 rounded-xl border p-2 text-left shadow-sm ${
                    selected
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                >
                  <SafeImage
                    src={topic.thumbnail}
                    alt=""
                    variant="thumbnail"
                    className="aspect-video w-28 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-sm font-semibold">
                      {topic.title}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {topic.channelTitle}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                      {topic.isLive && <LiveBadge />}
                      {suggestion ? (
                        <span className="font-medium text-violet-600 dark:text-violet-300">
                          スレを立てる
                        </span>
                      ) : (
                        <span>
                          {topic.postCount.toLocaleString()} 件
                          {rel ? ` · ${rel}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {hiddenCount > 0 && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full border border-violet-300 bg-white px-4 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950/20"
          >
            もっと見る（+{hiddenCount}）
          </button>
        </div>
      )}
    </section>
  );
}
