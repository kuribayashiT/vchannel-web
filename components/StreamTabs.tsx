"use client";

import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useSelectedChannels } from "@/hooks/useSelection";
import { usePlayingVideo } from "@/hooks/usePlayer";
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

const updatedAtFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

export function StreamTabs() {
  const [data, setData] = useState<StreamData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const playingVideoId = usePlayingVideo();
  const lastLoadedAtRef = useRef<number>(0);
  const hasDataRef = useRef(false);
  const refreshingRef = useRef(false);
  const clearRefreshFailedTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const response = await fetch("/api/streams", { cache: "no-store" });
      if (!response.ok) throw new Error("Stream data request failed");
      const nextData = (await response.json()) as StreamData;
      setData(nextData);
      hasDataRef.current = true;
      setFailed(false);
      setRefreshFailed(false);
      if (clearRefreshFailedTimer.current !== null) {
        window.clearTimeout(clearRefreshFailedTimer.current);
        clearRefreshFailedTimer.current = null;
      }
      const now = Date.now();
      lastLoadedAtRef.current = now;
      setUpdatedAt(new Date(now));
    } catch {
      setRefreshFailed(true);
      if (clearRefreshFailedTimer.current !== null) {
        window.clearTimeout(clearRefreshFailedTimer.current);
      }
      clearRefreshFailedTimer.current = window.setTimeout(() => {
        setRefreshFailed(false);
        clearRefreshFailedTimer.current = null;
      }, 4000);
      setFailed((prev) => prev || !hasDataRef.current);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const elapsed = Date.now() - lastLoadedAtRef.current;
      if (elapsed >= 60_000) void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load();
    }, 180_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [load]);

  useEffect(() => {
    return () => {
      if (clearRefreshFailedTimer.current !== null) {
        window.clearTimeout(clearRefreshFailedTimer.current);
      }
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
    <>
      <StreamTabsInner
        liveVideos={data.liveVideos}
        allVideos={data.allVideos}
        refreshing={refreshing}
        updatedAt={updatedAt}
        refreshFailed={refreshFailed}
        onRefresh={load}
      />
      <PullToRefresh
        disabled={playingVideoId !== null}
        refreshing={refreshing}
        onRefresh={load}
      />
    </>
  );
}

function StreamTabsInner({
  liveVideos,
  allVideos,
  refreshing,
  updatedAt,
  refreshFailed,
  onRefresh,
}: {
  liveVideos: StreamCardVideo[];
  allVideos: StreamCardVideo[];
  refreshing: boolean;
  updatedAt: Date | null;
  refreshFailed: boolean;
  onRefresh: () => Promise<void>;
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
  const updatedLabel = refreshFailed
    ? "更新に失敗しました"
    : updatedAt
      ? `${updatedAtFmt.format(updatedAt)} 更新`
      : "更新";

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div role="tablist" className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
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
        <button
          type="button"
          onClick={() => {
            void onRefresh();
          }}
          disabled={refreshing}
          aria-label="配信一覧を更新"
          className="shrink-0 rounded-full bg-zinc-100 px-3 py-2 text-xs text-zinc-600 transition-colors disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <span className="flex min-h-11 items-center gap-1.5">
            <RotateCw
              size={16}
              className={refreshing ? "animate-spin motion-reduce:animate-none" : ""}
            />
            <span className="hidden text-[11px] sm:inline">{updatedLabel}</span>
          </span>
        </button>
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
