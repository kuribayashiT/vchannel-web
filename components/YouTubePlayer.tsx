"use client";

import { X } from "lucide-react";
import { closePlayer, usePlayingVideo } from "@/hooks/usePlayer";

/** 画面下部の YouTube プレーヤー（埋め込み不可の動画は YouTube で開く） */
export function YouTubePlayer() {
  const id = usePlayingVideo();
  if (!id) return null;
  return (
    <div className="fixed inset-x-0 bottom-16 z-30 md:bottom-0 border-t border-zinc-300 bg-black shadow-lg dark:border-zinc-700">
      <div className="mx-auto flex max-w-4xl flex-col">
        <div className="flex items-center justify-between px-3 py-1 text-xs text-white">
          <a
            href={`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            YouTubeで開く
          </a>
          <button
            type="button"
            onClick={closePlayer}
            aria-label="プレーヤーを閉じる"
            className="px-2 text-base"
          >
            <X size={16} />
          </button>
        </div>
        <iframe
          key={id}
          title="YouTube プレーヤー"
          src={`https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="aspect-video max-h-[40vh] w-full"
        />
      </div>
    </div>
  );
}
