"use client";

import { useEffect, useState } from "react";
import { useFavorites } from "@/hooks/useFavorites";
import { VideoCard } from "@/components/VideoCard";
import type { Video } from "@/types";

type Status = "loading" | "error" | "ready";

export function FavoritesList() {
  const { ids, remove, clear } = useFavorites();
  const [videos, setVideos] = useState<Video[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  // 取得対象は追加/削除で変わるため、キーを文字列化して依存にする
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    fetch(`/api/videos?ids=${encodeURIComponent(key)}`, { signal: ctrl.signal })
      .then((r) =>
        r.ok ? (r.json() as Promise<Video[]>) : Promise.reject(r.status),
      )
      .then((v) => {
        setVideos(v);
        setStatus("ready");
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) {
          console.error(e);
          setStatus("error");
        }
      });
    return () => ctrl.abort();
  }, [key]);

  if (ids.length === 0) {
    return (
      <p className="py-16 text-center text-zinc-500">
        お気に入りの動画はありません。
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="py-16 text-center text-zinc-500">
        動画の読み込みに失敗しました。
      </p>
    );
  }
  if (status === "loading") {
    return <p className="py-16 text-center text-zinc-500">読み込み中…</p>;
  }

  const shown = videos.filter((v) => ids.includes(v.videoId));
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (window.confirm("お気に入りを全て削除しますか？")) clear();
        }}
        className="mb-4 rounded border border-red-500 px-3 py-1 text-sm text-red-600"
      >
        全て削除
      </button>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((v) => (
          <div key={v.videoId} className="space-y-1">
            <VideoCard v={v} />
            <button
              type="button"
              onClick={() => {
                if (window.confirm("お気に入りから削除しますか？"))
                  remove(v.videoId);
              }}
              className="text-xs text-red-600 underline"
            >
              削除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
