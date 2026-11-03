import { EventCalendar } from "@/components/EventCalendar";
import { GcsFetchError, getEventList } from "@/lib/gcs";
import type { EventList } from "@/types";

export const metadata = { title: "イベントカレンダー | Vちゃんねる" };

export default async function EventsPage() {
  let events: EventList | null = null;
  try {
    events = await getEventList();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <h1 className="mb-4 text-xl font-bold">イベントカレンダー</h1>
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
