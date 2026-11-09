"use client";

import { Star } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { useFavorites } from "@/hooks/useFavorites";
import { playVideo } from "@/hooks/usePlayer";
import { formatCompact } from "@/lib/format";
import type { StreamCardVideo } from "@/lib/stream";

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
export function VideoCard({
  v,
  live = false,
}: {
  v: StreamCardVideo;
  live?: boolean;
}) {
  const { ids, toggle } = useFavorites();
  const fav = ids.includes(v.videoId);

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
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
        <SafeImage
          src={v.thumbnail}
          alt=""
          variant="thumbnail"
          loading="lazy"
          referrerPolicy="no-referrer"
          className="aspect-video w-full object-cover"
        />
        <div className="space-y-1 p-3">
          {live && (
            <span
              className="inline-block animate-pulse rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
              title={`${(v.concurrentViewers ?? 0).toLocaleString()}人が視聴中`}
            >
              <span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-white" />              配信中 {formatCompact(v.concurrentViewers ?? 0)}人
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
        <Star size={16} className={fav ? "fill-current" : ""} />
      </button>
    </div>
  );
}
