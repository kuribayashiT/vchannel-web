"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useSelectedChannels } from "@/hooks/useSelection";
import {
  RANKING_TABS,
  subscriberRows,
  videoCountRows,
  weeklyHeading,
  weeklyRows,
  type RankingRow,
  type RankingTab,
} from "@/lib/ranking";
import type {
  Video,
  VideoCountRankingItem,
  YoutubeSubscriberRankingItem,
} from "@/types";

interface Props {
  weekly: Video[];
  subscribers: YoutubeSubscriberRankingItem[];
  videoCounts: VideoCountRankingItem[];
}

const PAGE = 100;
const noopSubscribe = () => () => {};

function Row({ r, rank }: { r: RankingRow; rank: number }) {
  const body = (
    <>
      <span className="w-8 shrink-0 text-center font-bold">{rank}</span>
      {r.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={r.thumbnail}
          alt=""
          loading="lazy"
          className="size-10 shrink-0 rounded-full object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{r.name}</p>
        <p className="truncate text-xs text-zinc-500">{r.sub ?? r.office}</p>
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums">
        {r.value.toLocaleString()}
        {r.unit}
      </span>
    </>
  );
  const cls =
    "flex items-center gap-3 border-b border-zinc-200 px-2 py-2 dark:border-zinc-800";
  return r.videoId ? (
    <a
      href={`https://www.youtube.com/watch?v=${r.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${cls} hover:bg-zinc-100 dark:hover:bg-zinc-900`}
    >
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function RankingTabs({ weekly, subscribers, videoCounts }: Props) {
  const [tab, setTab] = useState<RankingTab>("weekly");
  const [limit, setLimit] = useState(PAGE);
  const { channelIds } = useSelectedChannels();
  // 見出しの日付は現在時刻依存のため、マウント後にのみ表示する
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rows = useMemo(() => {
    if (tab === "weekly") return weeklyRows(weekly, channelIds);
    if (tab === "subscribers") return subscriberRows(subscribers, channelIds);
    return videoCountRows(videoCounts, channelIds);
  }, [tab, weekly, subscribers, videoCounts, channelIds]);

  const changeTab = (t: RankingTab) => {
    setTab(t);
    setLimit(PAGE);
  };

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-2 overflow-x-auto">
        {RANKING_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === tab}
            onClick={() => changeTab(t.key)}
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
      {tab === "weekly" && mounted && (
        <h2 className="mb-2 text-sm font-bold">{weeklyHeading(new Date())}</h2>
      )}
      {rows.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">
          ランキングデータがありません
        </p>
      ) : (
        <>
          {rows.slice(0, limit).map((r, i) => (
            <Row key={r.key} r={r} rank={i + 1} />
          ))}
          {limit < rows.length && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="mx-auto mt-4 block rounded border border-zinc-300 px-6 py-2 text-sm dark:border-zinc-700"
            >
              さらに表示
            </button>
          )}
        </>
      )}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="トップへ戻る"
        className="fixed bottom-6 right-6 size-12 rounded-full bg-blue-600 text-white shadow-lg"
      >
        ↑
      </button>
    </div>
  );
}
