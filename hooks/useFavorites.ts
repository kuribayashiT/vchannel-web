"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "favorites";
const EVENT = "vchannel:favorites";
const EMPTY: string[] = [];

let cache: { raw: string | null; value: string[] } = {
  raw: null,
  value: EMPTY,
};

function read(): string[] {
  const raw = localStorage.getItem(KEY);
  if (raw === cache.raw) return cache.value;
  let value = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      value = parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    // 壊れた値は空として扱う
  }
  cache = { raw, value };
  return value;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function write(next: string[]) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

/** お気に入り動画の videoID（localStorage `favorites`） */
export function useFavorites() {
  const ids = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((id: string) => {
    const cur = read();
    write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }, []);
  const remove = useCallback(
    (id: string) => write(read().filter((x) => x !== id)),
    [],
  );
  const clear = useCallback(() => write([]), []);
  return { ids, toggle, remove, clear };
}
