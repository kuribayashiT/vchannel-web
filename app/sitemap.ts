import type { MetadataRoute } from "next";
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
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}
