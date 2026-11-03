"use client";

import { useSyncExternalStore } from "react";

let current: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function playVideo(videoId: string) {
  current = videoId;
  emit();
}

export function closePlayer() {
  current = null;
  emit();
}

/** 再生中の YouTube 動画 ID（グローバル状態） */
export function usePlayingVideo(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}
