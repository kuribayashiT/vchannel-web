"use client";

import Link from "next/link";
import { useSelectedChannels } from "@/hooks/useSelection";
import type { SubscriberGrowthItem } from "@/types";

const MEDALS = ["🥇", "🥈", "🥉"];

/** 週間の登録者増加数 TOP3。選択中の事務所があればその中で集計する */
export function GrowthTop3({ items }: { items: SubscriberGrowthItem[] }) {
  const { channelIds } = useSelectedChannels();
  const top = (
    channelIds.length === 0
      ? items
      : items.filter((i) => channelIds.includes(i.channelId))
  ).slice(0, 3);

  if (top.length === 0) return null;

  return (
    <section aria-label="今週の急上昇" className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold">今週の急上昇 🔥</h2>
        <Link href="/ranking" className="text-xs text-blue-600">
          もっと見る ›
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {top.map((i, idx) => (
          <li key={i.channelId}>
            <Link
              href={`/vtuber/${encodeURIComponent(i.channelId)}`}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="text-xl">{MEDALS[idx]}</span>
              {i.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={i.thumbnail}
                  alt=""
                  loading="lazy"
                  className="size-10 shrink-0 rounded-full object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.name}</p>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  +{i.growth.toLocaleString()}人
                  <span className="ml-1 font-normal text-zinc-500">
                    +{i.rate.toFixed(2)}%
                  </span>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
