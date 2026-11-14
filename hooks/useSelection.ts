"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHANNELS_KEY = "selectedChannelIds";
const EVENT = "vchannel:local-state";
const EMPTY: string[] = [];

const listCache = new Map<string, { raw: string | null; value: string[] }>();

export function normalizeChannelSelection(
  next: readonly string[],
  allIds: readonly string[],
): string[] {
  const unique = [...new Set(next)];
  const all = new Set(allIds);
  if (
    all.size > 0 &&
    unique.length === all.size &&
    unique.every((id) => all.has(id))
  ) {
    return EMPTY;
  }
  return unique;
}

export function toggleChannelSelection(
  current: readonly string[],
  ids: readonly string[],
  allIds: readonly string[],
): string[] {
  if (current.length === 0) return normalizeChannelSelection(ids, allIds);

  const next = new Set(current);
  const allOn = ids.every((id) => next.has(id));
  for (const id of ids) {
    if (allOn) next.delete(id);
    else next.add(id);
  }
  return normalizeChannelSelection([...next], allIds);
}

function readList(key: string): string[] {
  const raw = localStorage.getItem(key);
  const hit = listCache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      value = parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    // 壊れた値は未選択として扱う
  }
  listCache.set(key, { raw, value });
  return value;
}

function write(key: string, value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** 選択中のチャンネル ID（空 = 絞り込みなし） */
export function useSelectedChannels() {
  const channelIds = useSyncExternalStore(
    subscribe,
    () => readList(CHANNELS_KEY),
    () => EMPTY,
  );
  const setChannelIds = useCallback(
    (next: string[], allIds?: readonly string[]) =>
      write(
        CHANNELS_KEY,
        JSON.stringify(allIds ? normalizeChannelSelection(next, allIds) : next),
      ),
    [],
  );
  return { channelIds, setChannelIds };
}

/** 選択を消して絞り込みを解除する */
export function resetSelection() {
  localStorage.removeItem(CHANNELS_KEY);
  window.dispatchEvent(new Event(EVENT));
}
