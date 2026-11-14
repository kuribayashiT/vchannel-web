import Link from "next/link";
import { connection } from "next/server";
import { EventCalendar } from "@/components/EventCalendar";
import { GcsFetchError, getEventList } from "@/lib/gcs";
import { dayKey, eventLabel, mergeEvents, todayJstParts } from "@/lib/events";
import type { EventList } from "@/types";

export const metadata = { title: "イベントカレンダー" };

export default async function EventsPage() {
  await connection();
  let events: EventList | null = null;
  try {
    events = await getEventList();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
  }
  const today = todayJstParts();
  const todayEvents = events
    ? (mergeEvents(events).get(dayKey(today.m, today.d)) ?? [])
    : null;
  const summary =
    todayEvents !== null
      ? `今日（${today.m}月${today.d}日）が誕生日・デビュー記念日のVTuberは${todayEvents.length}人です。`
      : "イベント情報の取得に失敗しました。";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">
        イベントカレンダー
      </h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">{summary}</p>
      {todayEvents && (
        <section className="mb-8">
          <h2 className="mb-2 font-bold">
            今日（{today.y}年{today.m}月{today.d}日）のイベント
          </h2>
          {todayEvents.length === 0 ? (
            <p className="py-4 text-sm text-zinc-500">今日のイベントはありません</p>
          ) : (
            <ul>
              {todayEvents.map((e, i) => (
                <li
                  key={`${e.channelId}-${e.eventType}-${i}`}
                  className="flex items-center justify-between gap-3 border-b border-zinc-200 py-2 dark:border-zinc-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <Link
                        href={`/vtuber/${e.channelId}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {e.name}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-zinc-500">{e.office}</p>
                  </div>
                  <span className="shrink-0 rounded bg-pink-100 px-2 py-0.5 text-xs text-pink-700">
                    {eventLabel(e, today.y)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {events ? (
        <EventCalendar events={events} initialDate={today} />
      ) : (
        <p className="py-16 text-center text-zinc-500">
          イベントの読み込みに失敗しました。
        </p>
      )}
    </main>
  );
}
