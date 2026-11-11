import type { EventList, VEvent } from "@/types";

/** eventList.json は `[ { "M/D": VEvent[] }, ... ]`。キーが重複しても結合する */
export function mergeEvents(list: EventList): Map<string, VEvent[]> {
  const map = new Map<string, VEvent[]>();
  for (const obj of list) {
    for (const [key, events] of Object.entries(obj)) {
      map.set(key, [...(map.get(key) ?? []), ...events]);
    }
  }
  return map;
}

export function dayKey(month: number, day: number): string {
  return `${month}/${day}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateSlug(month: number, day: number): string {
  return `${pad2(month)}-${pad2(day)}`;
}

export function parseDateSlug(slug: string): { month: number; day: number } | null {
  const m = /^(\d{2})-(\d{2})$/.exec(slug);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const days = new Date(2024, month, 0).getDate();
  if (day < 1 || day > days) return null;
  return { month, day };
}

export function allDateSlugs(): string[] {
  const out: string[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const days = new Date(2024, month, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      out.push(formatDateSlug(month, day));
    }
  }
  return out;
}

export function shiftDateSlug(slug: string, delta: number): string | null {
  const parsed = parseDateSlug(slug);
  if (!parsed) return null;
  const base = new Date(Date.UTC(2024, parsed.month - 1, parsed.day));
  base.setUTCDate(base.getUTCDate() + delta);
  if (base.getUTCFullYear() < 2024) {
    return "12-31";
  }
  if (base.getUTCFullYear() > 2024) {
    return "01-01";
  }
  return formatDateSlug(base.getUTCMonth() + 1, base.getUTCDate());
}

const jstParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export function todayJstParts(now: Date = new Date()): {
  y: number;
  m: number;
  d: number;
} {
  const [y, m, d] = jstParts
    .formatToParts(now)
    .filter((p) => p.type !== "literal")
    .map((p) => Number(p.value));
  return { y, m, d };
}

/** 周年 `N周年` / `誕生日` / 未来日 `未来のイベント` / 不明 `不明` */
export function eventLabel(e: VEvent, selectedYear: number): string {
  if (e.eventType === "birthday") return "誕生日";
  if (e.eventType === "createAt") {
    const y = Number(e.createdAt?.slice(0, 4));
    if (!Number.isFinite(y) || y <= 0) return "不明";
    const n = selectedYear - y;
    return n > 0 ? `${n}周年` : "未来のイベント";
  }
  return "不明";
}

/** 月のカレンダー行列（日曜始まり）。日付の無いマスは null */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}
