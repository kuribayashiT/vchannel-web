import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { loadVTubers } from "@/lib/server-data";
import { SITE_URL } from "@/lib/site";

const PAGES: {
  path: string;
  changeFrequency: "hourly" | "daily";
  priority: number;
}[] = [
  { path: "/", changeFrequency: "hourly", priority: 1 },
  { path: "/ranking", changeFrequency: "daily", priority: 0.8 },
  { path: "/news", changeFrequency: "hourly", priority: 0.7 },
  { path: "/vtuber", changeFrequency: "daily", priority: 0.7 },
  { path: "/events", changeFrequency: "daily", priority: 0.6 },
  { path: "/chat", changeFrequency: "hourly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "daily", priority: 0.3 },
];

const SITEMAP_PAGE_SIZE = 50_000;

function staticEntries(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}

function parseYmd(ymd: string | undefined): Date | undefined {
  if (!ymd || !/^\d{8}$/.test(ymd)) return undefined;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6)) - 1;
  const day = Number(ymd.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date;
}

async function vtuberEntries(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("days");
  const { index, details } = await loadVTubers();
  return index.map((item) => {
    const latestYmd = details.get(item.channelId)?.transition.at(-1)?.date;
    return {
      url: `${SITE_URL}/vtuber/${item.channelId}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
      lastModified: parseYmd(latestYmd),
    };
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = staticEntries();
  try {
    const all = [...staticPages, ...(await vtuberEntries())];
    // 現在は 1 ファイル運用。5万 URL を超えたら sitemap 分割ルートへ移行する。
    return all.slice(0, SITEMAP_PAGE_SIZE);
  } catch {
    return staticPages;
  }
}
