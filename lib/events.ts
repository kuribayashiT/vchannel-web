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
