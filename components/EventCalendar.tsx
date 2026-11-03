"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { dayKey, eventLabel, mergeEvents, monthGrid } from "@/lib/events";
import type { EventList } from "@/types";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const MIN_YEAR = 2015;
const MAX_YEAR = 2050;
const noopSubscribe = () => () => {};

const jstParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function todayJst() {
  const [y, m, d] = jstParts
    .formatToParts(new Date())
    .filter((p) => p.type !== "literal")
    .map((p) => Number(p.value));
  return { y, m, d };
}

export function EventCalendar({ events }: { events: EventList }) {
  // 今日の日付は現在時刻依存のため、マウント後に初期化する
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  if (!mounted) {
    return <p className="py-16 text-center text-zinc-500">読み込み中…</p>;
  }
  return <Calendar events={events} />;
}

function Calendar({ events }: { events: EventList }) {
  const today = useMemo(() => todayJst(), []);
  const [year, setYear] = useState(today.y);
  const [month, setMonth] = useState(today.m);
  const [selected, setSelected] = useState(today.d);
  const map = useMemo(() => mergeEvents(events), [events]);
  const grid = useMemo(() => monthGrid(year, month), [year, month]);

  const shift = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    const y = d.getFullYear();
    if (y < MIN_YEAR || y > MAX_YEAR) return;
    setYear(y);
    setMonth(d.getMonth() + 1);
    setSelected(1);
  };

  const dayEvents = map.get(dayKey(month, selected)) ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="前の月"
          className="px-3 py-1 text-lg"
        >
          ‹
        </button>
        <h2 className="font-bold">
          {year}年{month}月
        </h2>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="次の月"
          className="px-3 py-1 text-lg"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-zinc-500">
        {WEEK.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {grid.flat().map((d, i) => {
          if (d === null) return <div key={i} />;
          const n = map.get(dayKey(month, d))?.length ?? 0;
          const isSel = d === selected;
          const isToday =
            year === today.y && month === today.m && d === today.d;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(d)}
              aria-pressed={isSel}
              className={`flex h-14 flex-col items-center rounded py-1 text-sm ${
                isSel
                  ? "bg-blue-600 text-white"
                  : isToday
                    ? "bg-blue-100 dark:bg-blue-950"
                    : ""
              }`}
            >
              {d}
              <span className="mt-1 flex items-center gap-0.5">
                {Array.from({ length: Math.min(n, 3) }, (_, k) => (
                  <span key={k} className="size-1.5 rounded-full bg-pink-500" />
                ))}
                {n > 3 && <span className="text-[10px]">+{n - 3}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <h3 className="mb-2 mt-6 font-bold">
        {year}年{month}月{selected}日
      </h3>
      {dayEvents.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          イベントはありません
        </p>
      ) : (
        <ul>
          {dayEvents.map((e, i) => (
            <li
              key={`${e.channelId}-${e.eventType}-${i}`}
              className="flex items-center gap-3 border-b border-zinc-200 py-2 dark:border-zinc-800"
            >
              {e.channelThumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.channelThumbnail}
                  alt=""
                  loading="lazy"
                  className="size-10 rounded-full object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.name}</p>
                <p className="truncate text-xs text-zinc-500">{e.office}</p>
              </div>
              <span className="shrink-0 rounded bg-pink-100 px-2 py-0.5 text-xs text-pink-700">
                {eventLabel(e, year)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
