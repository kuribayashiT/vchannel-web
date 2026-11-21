"use client";

const CLICK_PREFIX = "newsClicked:";

function jstDayKey(base = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const get = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

function loadClickedSet(dayKey: string): Set<string> {
  try {
    const key = `${CLICK_PREFIX}${dayKey}`;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const itemKey = localStorage.key(i);
      if (!itemKey?.startsWith(CLICK_PREFIX) || itemKey === key) continue;
      localStorage.removeItem(itemKey);
    }
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function saveClickedSet(dayKey: string, ids: Set<string>): void {
  try {
    const key = `${CLICK_PREFIX}${dayKey}`;
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {
    return;
  }
}

function markClickedOncePerDay(id: string): boolean {
  if (!/^[0-9a-z]{1,8}$/.test(id)) return false;
  const dayKey = jstDayKey();
  const clicked = loadClickedSet(dayKey);
  if (clicked.has(id)) return false;
  clicked.add(id);
  saveClickedSet(dayKey, clicked);
  return true;
}

export function sendNewsClick(id: string): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!markClickedOncePerDay(id)) return;

  const payload = JSON.stringify({ id });
  try {
    if (navigator.sendBeacon) {
      const body = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/news/click", body);
      return;
    }
  } catch {
    // ignore and fallback to fetch below
  }

  void fetch("/api/news/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}
