"use client";

import { type ReactNode, useMemo, useState, useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import { NewsClusterCard } from "@/components/NewsClusterCard";
import { useFavorites } from "@/hooks/useFavorites";
import {
  NEWS_CATEGORY_LABELS,
  type NewsCategory,
  type NewsCluster,
} from "@/lib/news";

type FilterKey = "all" | "favorites" | NewsCategory;

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parseNewsDate(value: string): number {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return Date.parse(value.replace(" ", "T") + "+09:00");
  }
  return Date.parse(value);
}

function headingForDate(dateMs: number, mounted: boolean): string {
  const day = ymdFmt.format(dateMs);
  if (mounted) {
    const today = ymdFmt.format(Date.now());
    if (day === today) return "今日";
    const yesterdayMs = Date.now() - 86_400_000;
    if (day === ymdFmt.format(yesterdayMs)) return "昨日";
  }
  return dateFmt.format(dateMs);
}

function noopSubscribe() {
  return () => {};
}

function hasFavoriteVtuber(cluster: NewsCluster, favorites: Set<string>): boolean {
  return cluster.vtubers.some((vtuber) => favorites.has(vtuber.channelId));
}

export function NewsList({ clusters }: { clusters: NewsCluster[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const { ids } = useFavorites();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const favoriteIds = useMemo(() => new Set((mounted ? ids : []).filter(Boolean)), [ids, mounted]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<NewsCategory, number>();
    for (const cluster of clusters) {
      counts.set(cluster.category, (counts.get(cluster.category) ?? 0) + 1);
    }
    return counts;
  }, [clusters]);

  const favoriteCount = useMemo(
    () =>
      mounted
        ? clusters.filter((cluster) => hasFavoriteVtuber(cluster, favoriteIds)).length
        : 0,
    [clusters, favoriteIds, mounted],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return clusters;
    if (filter === "favorites") {
      return clusters.filter((cluster) => hasFavoriteVtuber(cluster, favoriteIds));
    }
    return clusters.filter((cluster) => cluster.category === filter);
  }, [clusters, favoriteIds, filter]);

  const chips: Array<{ key: FilterKey; label: ReactNode; count?: number }> = [
    { key: "all", label: "すべて", count: clusters.length },
  ];
  if (mounted && favoriteCount > 0) {
    chips.push({
      key: "favorites",
      label: (
        <span className="inline-flex items-center gap-1">
          <Heart size={12} fill="currentColor" />
          お気に入り
        </span>
      ),
      count: favoriteCount,
    });
  }
  for (const [category, count] of categoryCounts.entries()) {
    if (count <= 0) continue;
    chips.push({
      key: category,
      label: NEWS_CATEGORY_LABELS[category],
      count,
    });
  }

  return (
    <section className="mt-5">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-pressed={filter === chip.key}
            onClick={() => setFilter(chip.key)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
              filter === chip.key
                ? "border-violet-600 bg-violet-600 text-white"
                : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            }`}
          >
            {chip.label}
            {typeof chip.count === "number" ? ` ${chip.count}` : ""}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <p>該当するニュースがありません</p>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="mt-2 text-xs text-blue-600 underline dark:text-blue-300"
          >
            すべて表示に戻す
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map((cluster, index) => {
            const dateMs = parseNewsDate(cluster.latestAt);
            const currentDay = Number.isFinite(dateMs)
              ? headingForDate(dateMs, mounted)
              : "";
            const prev = filtered[index - 1];
            const prevDate = prev ? parseNewsDate(prev.latestAt) : Number.NaN;
            const prevDay = Number.isFinite(prevDate)
              ? headingForDate(prevDate, mounted)
              : "";
            const showHeader = index === 0 || currentDay !== prevDay;
            return (
              <div key={cluster.id}>
                {showHeader && currentDay && (
                  <h2 className="mb-2 text-sm font-bold text-zinc-700 dark:text-zinc-200">
                    {currentDay}
                  </h2>
                )}
                <NewsClusterCard
                  cluster={cluster}
                  isFavorite={hasFavoriteVtuber(cluster, favoriteIds)}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
