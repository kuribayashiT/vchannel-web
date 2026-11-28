import Link from "next/link";
import { ChevronDown, Heart } from "lucide-react";
import { NewsExternalLink } from "@/components/NewsExternalLink";
import { NewsThumbFallback } from "@/components/NewsThumbFallback";
import { SafeImage } from "@/components/SafeImage";
import { NEWS_CATEGORY_LABELS, type NewsCluster } from "@/lib/news";

const dateTimeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function parseNewsDate(value: string): number {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return Date.parse(value.replace(" ", "T") + "+09:00");
  }
  return Date.parse(value);
}

function formatNewsDate(value: string): string {
  const ms = parseNewsDate(value);
  if (!Number.isFinite(ms)) return value;
  return dateTimeFmt.format(ms);
}

export function NewsClusterCard({
  cluster,
  isFavorite,
  featured = false,
}: {
  cluster: NewsCluster;
  isFavorite: boolean;
  featured?: boolean;
}) {
  const extraSourceCount = Math.max(0, cluster.sourceCount - 1);
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className={featured ? "space-y-2" : "flex gap-3"}>
        <NewsExternalLink
          id={cluster.lead.id}
          href={cluster.lead.url}
          className={featured ? "block" : "shrink-0"}
        >
          <SafeImage
            src={cluster.imageSrc}
            alt=""
            variant="thumbnail"
            loading="lazy"
            referrerPolicy="no-referrer"
            className={
              featured
                ? "aspect-video w-full rounded object-cover"
                : "h-20 w-32 rounded object-cover"
            }
            fallback={
              <NewsThumbFallback
                category={cluster.category}
                source={cluster.lead.source}
                size={featured ? "featured" : "list"}
              />
            }
          />
        </NewsExternalLink>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs text-blue-600">
            {cluster.lead.source}
            {cluster.lead.tier === "official" && (
              <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                公式
              </span>
            )}
            <span className="ml-2 text-zinc-500">
              {NEWS_CATEGORY_LABELS[cluster.category]}
            </span>
          </p>
          <NewsExternalLink
            id={cluster.lead.id}
            href={cluster.lead.url}
            className="line-clamp-2 text-sm font-medium"
          >
            {cluster.lead.title}
          </NewsExternalLink>
          <p className="text-xs text-zinc-500">{formatNewsDate(cluster.latestAt)}</p>
        </div>
      </div>

      {cluster.vtubers.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {cluster.vtubers.map((vtuber) => (
            <Link
              key={vtuber.channelId}
              href={`/vtuber/${encodeURIComponent(vtuber.channelId)}`}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
            >
              <SafeImage
                src={vtuber.thumbnail}
                alt=""
                variant="avatar"
                loading="lazy"
                referrerPolicy="no-referrer"
                className="size-6 rounded-full object-cover"
              />
              <span>{vtuber.name}</span>
            </Link>
          ))}
          {isFavorite && (
            <span className="inline-flex items-center gap-1 text-xs text-pink-600 dark:text-pink-300">
              <Heart size={12} fill="currentColor" />
              ♥
            </span>
          )}
        </div>
      )}

      {extraSourceCount > 0 && (
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
            <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
            ほか {extraSourceCount} 媒体
          </summary>
          <ul className="mt-2 space-y-1 pl-4 text-xs">
            {cluster.others.map((other) => (
              <li key={other.id}>
                <NewsExternalLink
                  id={other.id}
                  href={other.url}
                  className="text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
                >
                  {other.source} — {other.title}
                </NewsExternalLink>
              </li>
            ))}
          </ul>
        </details>
      )}

      {cluster.lead.videoUrl && (
        <a
          href={cluster.lead.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs text-red-600 underline"
        >
          ▶ 解説動画を見る
        </a>
      )}
    </article>
  );
}
