import { cacheLife } from "next/cache";
import {
  allDateSlugs,
  dayKey,
  mergeEvents,
  parseDateSlug,
} from "@/lib/events";
import { getEventList } from "@/lib/gcs";
import { loadVTubers } from "@/lib/server-data";
import type { VEvent } from "@/types";

type EventContext = {
  eventsMap: Map<string, VEvent[]>;
  subscriberCounts: Map<string, number>;
};

function sortEventsBySubscriber(
  events: VEvent[],
  subscriberCounts: Map<string, number>,
): VEvent[] {
  return events
    .map((event, index) => ({
      event,
      index,
      subscriberCount: subscriberCounts.get(event.channelId),
    }))
    .sort((a, b) => {
      if (a.subscriberCount == null && b.subscriberCount == null) {
        return a.index - b.index;
      }
      if (a.subscriberCount == null) return 1;
      if (b.subscriberCount == null) return -1;
      if (a.subscriberCount !== b.subscriberCount) {
        return b.subscriberCount - a.subscriberCount;
      }
      return a.index - b.index;
    })
    .map((item) => item.event);
}

async function getCachedEventsContext(): Promise<EventContext> {
  "use cache";
  cacheLife("days");
  const list = await getEventList();
  let subscriberCounts = new Map<string, number>();
  try {
    const { index } = await loadVTubers();
    subscriberCounts = new Map(
      index.map((item) => [item.channelId, item.subscriberCount]),
    );
  } catch {
    subscriberCounts = new Map();
  }
  return {
    eventsMap: mergeEvents(list),
    subscriberCounts,
  };
}

export async function getCachedSortedEventsMapByDateSlug(): Promise<
  Map<string, VEvent[]>
> {
  "use cache";
  cacheLife("days");
  const { eventsMap, subscriberCounts } = await getCachedEventsContext();
  const sortedBySlug = new Map<string, VEvent[]>();
  for (const slug of allDateSlugs()) {
    const parsed = parseDateSlug(slug);
    if (!parsed) {
      sortedBySlug.set(slug, []);
      continue;
    }
    const events = eventsMap.get(dayKey(parsed.month, parsed.day)) ?? [];
    sortedBySlug.set(slug, sortEventsBySubscriber(events, subscriberCounts));
  }
  return sortedBySlug;
}

export async function getCachedSortedEventsByDateSlug(
  dateSlug: string,
): Promise<VEvent[]> {
  "use cache";
  cacheLife("days");
  const sortedBySlug = await getCachedSortedEventsMapByDateSlug();
  return sortedBySlug.get(dateSlug) ?? [];
}
