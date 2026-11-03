"use client";

import { useFavorites } from "@/hooks/useFavorites";
import { playVideo } from "@/hooks/usePlayer";
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

/** サムネイル押下でページ下部のプレーヤーで再生。右上の★でお気に入りを切り替える */
export function VideoCard({ v, live = false }: { v: Video; live?: boolean }) {
  const { ids, toggle } = useFavorites();
  const fav = ids.includes(v.videoId);

  return (
    <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white hover:shadow dark:border-zinc-800 dark:bg-zinc-900">
      <a
        href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          // 修飾キー付きは通常のリンク動作（別タブ）に任せる
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          playVideo(v.videoId);
        }}
        className="block"
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
      <button
        type="button"
        onClick={() => toggle(v.videoId)}
        aria-pressed={fav}
        aria-label={fav ? "お気に入りから削除" : "お気に入りに追加"}
        className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-lg text-white"
      >
        {fav ? "★" : "☆"}
      </button>
    </div>
  );
}
