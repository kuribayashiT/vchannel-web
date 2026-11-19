import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cacheLife } from "next/cache";
import { marked } from "marked";
import { getCachedSortedEventsMapByDateSlug } from "@/lib/events-data";
import { getSubscriberTransitionList, getWeeklyLiveViewRanking } from "@/lib/gcs";
import { getCalendarMonthGrowth } from "@/lib/growth-data";
import { eventLabel, formatDateSlug, todayJstParts } from "@/lib/events";
import { getCachedVTuberPageData } from "@/lib/server-data";
import type {
  SubscriberGrowthItem,
  VEvent,
  Video,
  VTuberIndexItem,
} from "@/types";

export type ReportEventPerson = {
  channelId: string;
  name: string;
  office: string;
  subscriberCount: number;
  milestones: string[];
};

export type MonthlyReport = {
  month: string;
  title: string;
  isCurrentMonth: boolean;
  growth: SubscriberGrowthItem[];
  officeGrowth: { office: string; growth: number }[];
  liveVideos: Video[];
  birthdays: number;
  debutAnniversaries: number;
  eventPeople: ReportEventPerson[];
  dataThrough: string | null;
};

type ReportMonth = { year: number; month: number };

function parseMonth(month: string): ReportMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || monthNumber < 1 || monthNumber > 12) return null;
  return { year, month: monthNumber };
}

export function currentReportMonth(): string {
  const { y, m } = todayJstParts();
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function todayReportDate(): string {
  const { y, m, d } = todayJstParts();
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

export async function getCurrentReportContext(): Promise<{
  month: string;
  date: string;
}> {
  "use cache";
  cacheLife("hours");
  return { month: currentReportMonth(), date: todayReportDate() };
}

function monthOfDate(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`;
}

function isValidDate(ymd: string): boolean {
  if (!/^\d{8}$/.test(ymd)) return false;
  const date = new Date(
    `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00.000Z`,
  );
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) ===
      `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
  );
}

export async function getReportMonths(asOfMonth: string): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  if (!parseMonth(asOfMonth)) {
    throw new Error(`Invalid report month: ${asOfMonth}`);
  }

  const transitions = await getSubscriberTransitionList();
  const months = new Set<string>([asOfMonth]);
  for (const points of Object.values(transitions)) {
    for (const point of points) {
      if (!isValidDate(point.date)) continue;
      const month = monthOfDate(point.date);
      if (month <= asOfMonth) months.add(month);
    }
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

function getOfficeGrowth(items: SubscriberGrowthItem[]) {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item.office) continue;
    totals.set(item.office, (totals.get(item.office) ?? 0) + item.growth);
  }
  return [...totals.entries()]
    .map(([office, growth]) => ({ office, growth }))
    .sort((a, b) => b.growth - a.growth || a.office.localeCompare(b.office))
    .slice(0, 5);
}

function collectEvents(
  month: string,
  selectedYear: number,
  eventsByDate: Map<string, VEvent[]>,
  directoryItems: VTuberIndexItem[],
): Pick<MonthlyReport, "birthdays" | "debutAnniversaries" | "eventPeople"> {
  const parsed = parseMonth(month);
  if (!parsed) throw new Error(`Invalid report month: ${month}`);

  const subscribers = new Map(
    directoryItems.map((item) => [item.channelId, item.subscriberCount]),
  );
  const people = new Map<
    string,
    ReportEventPerson & { eventTypes: Set<VEvent["eventType"]> }
  >();
  const daysInMonth = new Date(
    Date.UTC(parsed.year, parsed.month, 0),
  ).getUTCDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const slug = formatDateSlug(parsed.month, day);
    for (const event of eventsByDate.get(slug) ?? []) {
      const key = event.channelId || `${event.name}:${event.eventType}`;
      let person = people.get(key);
      if (!person) {
        person = {
          channelId: event.channelId,
          name: event.name,
          office: event.office,
          subscriberCount: subscribers.get(event.channelId) ?? 0,
          milestones: [],
          eventTypes: new Set(),
        };
        people.set(key, person);
      }
      person.eventTypes.add(event.eventType);
      const label =
        event.eventType === "birthday"
          ? "誕生日"
          : eventLabel(event, selectedYear);
      if (!person.milestones.includes(label)) person.milestones.push(label);
    }
  }

  const allPeople = [...people.values()];
  return {
    birthdays: allPeople.filter((person) =>
      person.eventTypes.has("birthday"),
    ).length,
    debutAnniversaries: allPeople.filter((person) =>
      person.eventTypes.has("createAt"),
    ).length,
    eventPeople: allPeople
      .sort(
        (a, b) =>
          b.subscriberCount - a.subscriberCount || a.name.localeCompare(b.name),
      )
      .slice(0, 10)
      .map((person) => ({
        channelId: person.channelId,
        name: person.name,
        office: person.office,
        subscriberCount: person.subscriberCount,
        milestones: person.milestones,
      })),
  };
}

function getMonthlyLiveVideos(videos: Video[], month: string): Video[] {
  const monthKey = month.replace("-", "");
  const monthFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  });
  return videos
    .filter((video) => {
      if (!video.channelId || !video.videoId || video.concurrentViewers <= 0) {
        return false;
      }
      const date = new Date(video.comparisonDay);
      return (
        !Number.isNaN(date.getTime()) &&
        monthFormatter.format(date).replace("-", "") === monthKey
      );
    })
    .sort((a, b) => b.concurrentViewers - a.concurrentViewers)
    .slice(0, 10);
}

export async function getMonthlyReport(
  month: string,
  asOfMonth: string,
  asOfDate: string,
): Promise<MonthlyReport | null> {
  "use cache";
  cacheLife("hours");
  const parsed = parseMonth(month);
  if (!parsed || month > asOfMonth || !isValidDate(asOfDate)) return null;
  if (!(await getReportMonths(asOfMonth)).includes(month)) return null;

  const [growthPeriod, weeklyVideos, eventsByDate, pageData] =
    await Promise.all([
      getCalendarMonthGrowth(month, asOfDate),
      getWeeklyLiveViewRanking(),
      getCachedSortedEventsMapByDateSlug(),
      getCachedVTuberPageData(),
    ]);
  const growth = growthPeriod.items;
  const events = collectEvents(
    month,
    parsed.year,
    eventsByDate,
    pageData.directoryItems,
  );

  return {
    month,
    title: `${parsed.year}年${parsed.month}月のVTuber月間レポート｜登録者の伸び・人気配信まとめ`,
    isCurrentMonth: month === asOfMonth,
    growth: growth.slice(0, 10),
    officeGrowth: getOfficeGrowth(growth),
    liveVideos: getMonthlyLiveVideos(weeklyVideos, month),
    ...events,
    dataThrough: growthPeriod.to
      ? `${growthPeriod.to.slice(0, 4)}-${growthPeriod.to.slice(4, 6)}-${growthPeriod.to.slice(6, 8)}`
      : null,
  };
}

export function getReportComment(month: string): string | null {
  if (!parseMonth(month)) throw new Error(`Invalid report month: ${month}`);
  const filename = path.join(process.cwd(), "content", "reports", `${month}.md`);
  if (!existsSync(filename)) return null;
  const markdown = readFileSync(filename, "utf8").trim();
  if (!markdown) return null;
  return marked.parse(markdown, { async: false });
}
