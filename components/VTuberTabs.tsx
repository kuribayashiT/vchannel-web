"use client";

import { smallAvatar } from "@/lib/url";
import { useEffect, useMemo, useState } from "react";
import { AffiliateLinks } from "@/components/AffiliateLinks";
import { VTuberDetailSkeleton, VTuberTabsSkeleton } from "@/components/Skeleton";
import { VideoCard } from "@/components/VideoCard";
import { useSelectedChannels } from "@/hooks/useSelection";
import { formatCompact, formatNumber } from "@/lib/format";
import type { VTuberDetail, VTuberIndexItem, VTuberTabItem } from "@/types";

/** 取得済みの詳細（成功結果のみ保持。失敗は保持しない） */
const detailCache = new Map<string, VTuberDetail>();
/** 取得中のリクエストを共有して、同じ ID の二重リクエストを防ぐ */
const inflight = new Map<string, Promise<VTuberDetail | null>>();

function fetchDetail(channelId: string): Promise<VTuberDetail | null> {
  const cached = detailCache.get(channelId);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(channelId);
  if (pending) return pending;

  const promise = fetch(`/api/vtuber/${encodeURIComponent(channelId)}`)
    .then((r) =>
      r.ok ? (r.json() as Promise<VTuberDetail>) : Promise.reject(r.status),
    )
    .then((detail): VTuberDetail | null => {
      detailCache.set(channelId, detail);
      return detail;
    })
    .catch((): VTuberDetail | null => null)
    .finally(() => {
      inflight.delete(channelId);
    });
  inflight.set(channelId, promise);
  return promise;
}

/** 詳細の先読み（キャッシュ済み・取得中なら何もしない） */
function prefetchDetail(channelId: string): void {
  if (detailCache.has(channelId) || inflight.has(channelId)) return;
  void fetchDetail(channelId);
}

function SubscriberChart({ data }: { data: VTuberDetail["transition"] }) {
  if (data.length < 2) {
    return <p className="py-6 text-center text-sm text-zinc-500">データなし</p>;
  }
  const W = 300;
  const H = 120;
  const counts = data.map((d) => d.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const span = max - min || 1;
  const pts = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((d.count - min) / span) * (H - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full"
        role="img"
        aria-label="登録者数の推移（30日）"
      >
        <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-xs text-zinc-500">
        <span title={formatNumber(min)}>{formatCompact(min)}</span>
        <span title={formatNumber(max)}>{formatCompact(max)}</span>
      </div>
    </div>
  );
}

export function DetailView({ detail: d }: { detail: VTuberDetail }) {
  const stats: Array<{ label: string; value: number }> = [
    { label: "登録者数", value: d.subscriberCount },
    { label: "総再生数", value: d.viewCount },
    { label: "動画本数", value: d.videoCount },
  ];

  const latestVideoTitle = d.videos[0]?.title ?? null;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl">
        {d.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={d.thumbnail}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full scale-125 object-cover blur-xl"
          />
        )}
        <div className="relative flex items-center gap-4 bg-black/60 p-4 text-white">
          {d.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d.thumbnail}
              alt=""
              className="size-20 rounded-full object-cover"
            />
          )}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{d.name}</h2>
            <p className="text-sm opacity-80">{d.office}</p>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {stats.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="font-bold tabular-nums" title={formatNumber(value)}>
              {formatCompact(value)}
            </dd>
          </div>
        ))}
      </dl>

      <section>
        <h3 className="mb-2 font-bold">登録者数の推移（30日）</h3>
        <SubscriberChart data={d.transition} />
      </section>

      <AffiliateLinks keyword={`${d.name} グッズ`} />

      <section>
        <h3 className="mb-2 font-bold">最新動画</h3>
        {latestVideoTitle && (
          <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">
            最新動画: {latestVideoTitle}
          </p>
        )}
        {d.videos.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            動画データがありません
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {d.videos.map((v) => (
              <VideoCard key={v.videoId} v={v} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function Detail({ channelId }: { channelId: string }) {
  const [result, setResult] = useState<{
    id: string;
    detail: VTuberDetail | null;
  } | null>(null);

  const cached = detailCache.get(channelId);

  useEffect(() => {
    if (detailCache.has(channelId)) return;
    let cancelled = false;
    fetchDetail(channelId).then((detail) => {
      if (!cancelled) setResult({ id: channelId, detail });
    });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const d: VTuberDetail | null | undefined =
    cached ?? (result && result.id === channelId ? result.detail : undefined);

  if (d === undefined) {
    return <VTuberDetailSkeleton />;
  }
  if (d === null) {
    return (
      <p className="py-16 text-center text-zinc-500">
        VTuberの詳細を取得できませんでした
      </p>
    );
  }

  return <DetailView detail={d} />;
}

type IndexState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: VTuberTabItem[] };

type VTuberTabsProps = {
  initialIndex?: VTuberTabItem[];
};

export function VTuberTabs({ initialIndex }: VTuberTabsProps) {
  const { channelIds } = useSelectedChannels();
  const [index, setIndex] = useState<IndexState>(() =>
    initialIndex ? { status: "ready", items: initialIndex } : { status: "loading" },
  );
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (initialIndex) return;
    const ctrl = new AbortController();
    fetch("/api/vtuber", { signal: ctrl.signal })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<VTuberIndexItem[]>)
          : Promise.reject(r.status),
      )
      .then((items) => setIndex({ status: "ready", items }))
      .catch(() => {
        if (!ctrl.signal.aborted) setIndex({ status: "error" });
      });
    return () => ctrl.abort();
  }, [initialIndex]);

  // API は事務所の初出順・公式アカウント先頭で返す。その順のまま選択分だけ残す
  const members = useMemo(() => {
    if (index.status !== "ready") return [];
    const sel = new Set(channelIds);
    return index.items.filter((m) => sel.has(m.channelId));
  }, [index, channelIds]);

  const currentId = (members.find((m) => m.channelId === active) ?? members[0])
    ?.channelId;

  // 表示中の詳細に加えて、次のタブ 1 件分を先読みする
  useEffect(() => {
    if (!currentId) return;
    const i = members.findIndex((m) => m.channelId === currentId);
    const next = members[i + 1];
    if (next) prefetchDetail(next.channelId);
  }, [members, currentId]);

  if (index.status === "loading") {
    return <VTuberTabsSkeleton />;
  }
  if (index.status === "error") {
    return (
      <p className="py-16 text-center text-zinc-500">
        Vtuberリストの取得に失敗しました
      </p>
    );
  }
  if (members.length === 0) {
    return (
      <p className="py-16 text-center text-zinc-500">
        Vtuberリストがありません（フィルターで事務所を選択してください）
      </p>
    );
  }

  const current = members.find((m) => m.channelId === active) ?? members[0];

  return (
    <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:items-start lg:gap-6">
      <div
        role="tablist"
        className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:mb-0 lg:max-h-[calc(100vh-6rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:rounded-xl lg:border lg:border-zinc-200 lg:bg-white lg:p-2 lg:shadow-sm dark:lg:border-zinc-800 dark:lg:bg-zinc-900"
      >
        {members.map((m) => (
          <button
            key={m.channelId}
            role="tab"
            aria-selected={m.channelId === current.channelId}
            onClick={() => setActive(m.channelId)}
            onPointerEnter={() => prefetchDetail(m.channelId)}
            onFocus={() => prefetchDetail(m.channelId)}
            className={`flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm lg:rounded-lg lg:py-2 ${
              m.channelId === current.channelId
                ? "bg-blue-600 text-white"
                : "bg-zinc-200 dark:bg-zinc-800"
            }`}
          >
            {m.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={smallAvatar(m.thumbnail)}
                referrerPolicy="no-referrer"
                alt=""
                loading="lazy"
                className="size-7 rounded-full object-cover"
              />
            )}
            <span className="max-w-40 truncate lg:max-w-none">{m.name}</span>
          </button>
        ))}
      </div>
      <Detail channelId={current.channelId} />
    </div>
  );
}
