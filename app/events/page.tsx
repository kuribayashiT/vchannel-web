import { EventCalendar } from "@/components/EventCalendar";
import { GcsFetchError, getEventList } from "@/lib/gcs";
import type { EventList } from "@/types";

export const metadata = { title: "イベントカレンダー" };

export default async function EventsPage() {
  let events: EventList | null = null;
  try {
    events = await getEventList();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">
        イベントカレンダー
      </h1>
      {events ? (
        <EventCalendar events={events} />
      ) : (
        <p className="py-16 text-center text-zinc-500">
          イベントの読み込みに失敗しました。
        </p>
      )}
    </main>
  );
}
