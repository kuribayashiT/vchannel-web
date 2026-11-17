import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { AffiliateLinks } from "@/components/AffiliateLinks";
import {
  getCachedSortedEventsByDateSlug,
  getCachedSortedEventsMapByDateSlug,
} from "@/lib/events-data";
import { GcsFetchError } from "@/lib/gcs";
import {
  eventLabel,
  formatDateSlug,
  parseDateSlug,
  shiftDateSlug,
  todayJstParts,
} from "@/lib/events";
import { SITE_URL } from "@/lib/site";
import type { VEvent } from "@/types";

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

async function getCurrentJstYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return todayJstParts().y;
}

function titleText(month: number, day: number): string {
  return `${month}月${day}日が誕生日・デビュー記念日のVTuber`;
}

function topNames(events: VEvent[], maxCount = 3): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const key = event.channelId || event.name;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(event.name);
    if (names.length >= maxCount) break;
  }
  return names;
}

function namesSummary(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}・${names[1]}`;
  return `${names[0]}・${names[1]}ほか`;
}

function titleWithNames(month: number, day: number, events: VEvent[]): string {
  const names = topNames(events, 3);
  if (names.length === 0) return titleText(month, day);
  return `${titleText(month, day)}（${namesSummary(names)}）`;
}

function descriptionWithNames(
  month: number,
  day: number,
  events: VEvent[],
): string {
  const names = topNames(events, 3);
  if (names.length === 0) {
    return `${month}月${day}日が誕生日・デビュー記念日のVTuberをまとめています。`;
  }
  return `${month}月${day}日が誕生日・デビュー記念日のVTuber（${namesSummary(names)}）をまとめています。`;
}

function nearbyDateSlugs(dateSlug: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const delta of [-3, -2, -1, 1, 2, 3]) {
    const shifted = shiftDateSlug(dateSlug, delta);
    if (!shifted || seen.has(shifted)) continue;
    seen.add(shifted);
    out.push(shifted);
  }
  return out;
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

  let events: VEvent[] = [];
  let loaded = false;
  try {
    events = await getCachedSortedEventsByDateSlug(date);
    loaded = true;
  } catch (error) {
    if (!(error instanceof GcsFetchError)) throw error;
  }

  const title = titleWithNames(parsed.month, parsed.day, events);
  const canonical = `/events/${formatDateSlug(parsed.month, parsed.day)}`;
  return {
    title,
    description: descriptionWithNames(parsed.month, parsed.day, events),
    alternates: { canonical },
    ...(loaded && events.length === 0
      ? { robots: { index: false, follow: true } }
      : {}),
    openGraph: { title, url: canonical },
    twitter: { title },
  };
}

export default async function EventDatePage({ params }: PageProps) {
  const { date } = await params;
  const parsed = parseDateSlug(date);
  if (!parsed) notFound();

  let sortedEventsMap = new Map<string, VEvent[]>();
  let events: VEvent[] = [];
  try {
    sortedEventsMap = await getCachedSortedEventsMapByDateSlug();
    events = sortedEventsMap.get(date) ?? [];
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
        {titleWithNames(parsed.month, parsed.day, events)}
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

      <section className="mb-8">
        <h2 className="mb-2 text-base font-bold">前後の日の誕生日・記念日</h2>
        <div className="space-y-2">
          {nearbyDateSlugs(date).map((slug) => {
            const nearbyEvents = sortedEventsMap.get(slug) ?? [];
            const parsedNearby = parseDateSlug(slug);
            if (!parsedNearby) return null;
            const headEvents = nearbyEvents.slice(0, 5);
            return (
              <article
                key={slug}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <h3 className="text-sm font-semibold">
                  <Link
                    href={`/events/${slug}`}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {parsedNearby.month}月{parsedNearby.day}日
                  </Link>
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {headEvents.length === 0 ? (
                    "該当なし"
                  ) : (
                    <>
                      {headEvents.map((event, index) => (
                        <span key={`${event.channelId}-${index}`}>
                          {index > 0 ? "、" : ""}
                          <Link
                            href={`/vtuber/${event.channelId}`}
                            className="text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {event.name}
                          </Link>
                        </span>
                      ))}
                      {nearbyEvents.length > 5 &&
                        ` ほか${nearbyEvents.length - 5}人`}
                    </>
                  )}
                </p>
              </article>
            );
          })}
        </div>
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
