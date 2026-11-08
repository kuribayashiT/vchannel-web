"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useSelectedChannels } from "@/hooks/useSelection";
import {
  STREAM_TABS,
  groupByHour,
  groupByTab,
  isLive,
  type StreamTab,
} from "@/lib/stream";
import { VideoCard } from "@/components/VideoCard";
import type { Video } from "@/types";

function Grid({ videos, live }: { videos: Video[]; live: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
  let list = groups[tab];

  // 「配信中」タブではアーカイブを除外し、実際に配信中の動画のみを表示
  if (tab === "live") {
    list = list.filter(isLive);
  }

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
