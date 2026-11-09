"use client";

import { useEffect, useMemo, useState } from "react";
import { useSelectedChannels } from "@/hooks/useSelection";
import {
  STREAM_TABS,
  groupByHour,
  groupByTab,
  type StreamCardVideo,
  type StreamTab,
} from "@/lib/stream";
import { VideoCard } from "@/components/VideoCard";

function Grid({
  videos,
  live,
}: {
  videos: StreamCardVideo[];
  live: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((v) => (
        <VideoCard key={v.videoId} v={v} live={live} />
      ))}
    </div>
  );
}

type StreamData = {
  liveVideos: StreamCardVideo[];
  allVideos: StreamCardVideo[];
};

export function StreamTabs() {
  const [data, setData] = useState<StreamData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/streams")
      .then((response) => {
        if (!response.ok) throw new Error("Stream data request failed");
        return response.json() as Promise<StreamData>;
      })
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="py-16 text-center text-zinc-500">
        動画の読み込みに失敗しました。
      </p>
    );
  }
  if (!data) {
    return (
      <p className="py-16 text-center text-zinc-500">配信予定を読み込み中…</p>
    );
  }
  return (
    <StreamTabsInner
      liveVideos={data.liveVideos}
      allVideos={data.allVideos}
    />
  );
}

function StreamTabsInner({
  liveVideos,
  allVideos,
}: {
  liveVideos: StreamCardVideo[];
  allVideos: StreamCardVideo[];
}) {
  const [tab, setTab] = useState<StreamTab>("live");
  const { channelIds } = useSelectedChannels();

  const groups = useMemo(() => {
    const filterBySelection = (list: StreamCardVideo[]) =>
      channelIds.length === 0
        ? list
        : list.filter((v) => channelIds.includes(v.channelId));
    const grouped = groupByTab(filterBySelection(allVideos));
    grouped.live = filterBySelection(liveVideos);
    return grouped;
  }, [allVideos, channelIds, liveVideos]);

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
