import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { AffiliateLinks } from "@/components/AffiliateLinks";
import { GcsFetchError, getEventList } from "@/lib/gcs";
import {
  allDateSlugs,
  dayKey,
  eventLabel,
  formatDateSlug,
  mergeEvents,
  parseDateSlug,
  shiftDateSlug,
  todayJstParts,
} from "@/lib/events";
import { SITE_URL } from "@/lib/site";
import type { EventList, VEvent } from "@/types";

type PageProps = {
  params: Promise<{ date: string }>;
};

type EventGroups = {
  birthdays: VEvent[];
  anniversaries: VEvent[];
};

function splitEvents(events: VEvent[]): EventGroups {
  return {
    birthdays: events.filter((event) => event.eventType === "birthday"),
    anniversaries: events.filter((event) => event.eventType === "createAt"),
  };
}

async function getEventsMap(): Promise<Map<string, VEvent[]>> {
  "use cache";
  cacheLife("days");
  const list = await getEventList();
  return mergeEvents(list);
}

async function getCurrentJstYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return todayJstParts().y;
}

function titleText(month: number, day: number): string {
  return `${month}月${day}日が誕生日・デビュー記念日のVTuber`;
}

export async function generateStaticParams() {
  return allDateSlugs().map((date) => ({ date }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = await params;
  const parsed = parseDateSlug(date);
  if (!parsed) {
    return {
      title: "イベントが見つかりません",
      robots: { index: false, follow: false },
    };
  }
  const title = titleText(parsed.month, parsed.day);
  const canonical = `/events/${formatDateSlug(parsed.month, parsed.day)}`;
  return {
    title,
    description: `${parsed.month}月${parsed.day}日が誕生日・デビュー記念日のVTuberをまとめています。`,
    alternates: { canonical },
    openGraph: { title, url: canonical },
    twitter: { title },
  };
}

export default async function EventDatePage({ params }: PageProps) {
  const { date } = await params;
  const parsed = parseDateSlug(date);
  if (!parsed) notFound();

  let events: VEvent[] = [];
  try {
    const map = await getEventsMap();
    events = map.get(dayKey(parsed.month, parsed.day)) ?? [];
  } catch (error) {
    if (!(error instanceof GcsFetchError)) throw error;
    events = [];
  }

  const year = await getCurrentJstYear();
  const { birthdays, anniversaries } = splitEvents(events);
  const summary = `${parsed.month}月${parsed.day}日に誕生日を迎えるVTuberは${birthdays.length}人、デビュー記念日（周年）を迎えるVTuberは${anniversaries.length}人です。`;
  const prev = shiftDateSlug(date, -1) ?? "12-31";
  const next = shiftDateSlug(date, 1) ?? "01-01";
  const itemList = events.map((event, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: `${SITE_URL}/vtuber/${event.channelId}`,
    name: event.name,
  }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: titleText(parsed.month, parsed.day),
    itemListElement: itemList,
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-3 text-2xl font-extrabold tracking-tight">
        {titleText(parsed.month, parsed.day)}
      </h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">{summary}</p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <nav className="mb-6 flex items-center justify-between text-sm">
        <Link href={`/events/${prev}`} className="text-blue-600 hover:underline dark:text-blue-400">
          ← 前日を見る
        </Link>
        <Link href="/events" className="text-blue-600 hover:underline dark:text-blue-400">
          カレンダーに戻る
        </Link>
        <Link href={`/events/${next}`} className="text-blue-600 hover:underline dark:text-blue-400">
          翌日を見る →
        </Link>
      </nav>

      <section className="mb-8">
        <h2 className="mb-2 text-base font-bold">誕生日</h2>
        {birthdays.length === 0 ? (
          <p className="py-3 text-sm text-zinc-500">該当するVTuberはいません</p>
        ) : (
          <ul>
            {birthdays.map((event, i) => (
              <li
                key={`${event.channelId}-birthday-${i}`}
                className="flex items-center gap-3 border-b border-zinc-200 py-2 dark:border-zinc-800"
              >
                {event.channelThumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.channelThumbnail}
                    alt=""
                    loading="lazy"
                    className="size-10 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    <Link
                      href={`/vtuber/${event.channelId}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {event.name}
                    </Link>
                  </p>
                  <p className="truncate text-xs text-zinc-500">{event.office}</p>
                </div>
                <span className="shrink-0 rounded bg-pink-100 px-2 py-0.5 text-xs text-pink-700">
                  {eventLabel(event, year)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-base font-bold">デビュー記念日（周年）</h2>
        {anniversaries.length === 0 ? (
          <p className="py-3 text-sm text-zinc-500">該当するVTuberはいません</p>
        ) : (
          <ul>
            {anniversaries.map((event, i) => (
              <li
                key={`${event.channelId}-anniversary-${i}`}
                className="flex items-center gap-3 border-b border-zinc-200 py-2 dark:border-zinc-800"
              >
                {event.channelThumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.channelThumbnail}
                    alt=""
                    loading="lazy"
                    className="size-10 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    <Link
                      href={`/vtuber/${event.channelId}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {event.name}
                    </Link>
                  </p>
                  <p className="truncate text-xs text-zinc-500">{event.office}</p>
                </div>
                <span className="shrink-0 rounded bg-pink-100 px-2 py-0.5 text-xs text-pink-700">
                  {eventLabel(event, year)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {events[0]?.name?.trim() && (
        <AffiliateLinks
          heading="お祝いグッズを探す"
          keyword={`${events[0].name.trim()} グッズ`}
        />
      )}
    </main>
  );
}
