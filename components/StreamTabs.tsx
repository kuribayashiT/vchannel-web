"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useSelectedChannels } from "@/hooks/useSelection";
import {
  STREAM_TABS,
  groupByHour,
  groupByTab,
  type StreamTab,
} from "@/lib/stream";
import type { Video } from "@/types";

const timeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : timeFmt.format(d);
}

function VideoCard({ v, live }: { v: Video; live: boolean }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${v.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-lg border border-zinc-200 bg-white hover:shadow dark:border-zinc-800 dark:bg-zinc-900"
    >
      {v.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={v.thumbnail}
          alt=""
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
      )}
      <div className="space-y-1 p-3">
        {live && (
          <span className="inline-block animate-pulse rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
            🔴 配信中 {v.concurrentViewers.toLocaleString()}人
          </span>
        )}
        <p className="line-clamp-2 text-sm font-medium">{v.title}</p>
        <p className="text-xs text-zinc-500">{v.channelTitle}</p>
        <p className="text-xs text-zinc-500">{formatTime(v.comparisonDay)}</p>
      </div>
    </a>
  );
}

function Grid({ videos, live }: { videos: Video[]; live: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((v) => (
        <VideoCard key={v.videoId} v={v} live={live} />
      ))}
    </div>
  );
}

const noopSubscribe = () => () => {};

/** 現在時刻に依存するため、プリレンダー時は描画せずマウント後に表示する */
export function StreamTabs({ videos }: { videos: Video[] }) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  if (!mounted) {
    return (
      <p className="py-16 text-center text-zinc-500">配信予定を読み込み中…</p>
    );
  }
  return <StreamTabsInner videos={videos} />;
}

function StreamTabsInner({ videos }: { videos: Video[] }) {
  const [tab, setTab] = useState<StreamTab>("live");
  const { channelIds } = useSelectedChannels();

  const groups = useMemo(() => {
    const filtered =
      channelIds.length === 0
        ? videos
        : videos.filter((v) => channelIds.includes(v.channelId));
    return groupByTab(filtered);
  }, [videos, channelIds]);

  const current = STREAM_TABS.find((t) => t.key === tab)!;
  const list = groups[tab];

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-2 overflow-x-auto">
        {STREAM_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === tab}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm ${
              t.key === tab
                ? "bg-blue-600 text-white"
                : "bg-zinc-200 dark:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">{current.empty}</p>
      ) : tab === "today" || tab === "tomorrow" ? (
        groupByHour(list).map(({ hour, videos: vs }) => (
          <section key={hour} className="mb-6">
            <h3 className="mb-2 text-sm font-bold">{hour}:00</h3>
            <Grid videos={vs} live={false} />
          </section>
        ))
      ) : (
        <Grid videos={list} live={tab === "live"} />
      )}
    </div>
  );
}
