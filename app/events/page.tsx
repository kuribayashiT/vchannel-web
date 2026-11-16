import { connection } from "next/server";
import { EventCalendar } from "@/components/EventCalendar";
import { GcsFetchError, getEventList } from "@/lib/gcs";
import { dayKey, mergeEvents, todayJstParts } from "@/lib/events";
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
