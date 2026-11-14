"use client";

import { smallAvatar } from "@/lib/url";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AffiliateLinks } from "@/components/AffiliateLinks";
import { VTuberDetailSkeleton, VTuberTabsSkeleton } from "@/components/Skeleton";
import { VideoCard } from "@/components/VideoCard";
import { useSelectedChannels } from "@/hooks/useSelection";
import { formatCompact, formatNumber } from "@/lib/format";
import { normalizeForSearch } from "@/lib/search";
import type {
  VTuberDetail,
  VTuberIndexItem,
  VTuberOfficeGroup,
  VTuberTabItem,
} from "@/types";

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
  | {
      status: "ready";
      items: (VTuberTabItem & { office: string; normalizedName: string })[];
      officeGroups: VTuberOfficeGroup[];
    };

type VTuberTabsProps = {
  initialIndex?: VTuberTabItem[];
  initialOfficeGroups?: VTuberOfficeGroup[];
};

function buildOfficeGroupsFromIndex(items: VTuberIndexItem[]): VTuberOfficeGroup[] {
  const groups: VTuberOfficeGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.office) {
      last.count += 1;
      continue;
    }
    groups.push({ name: item.office, count: 1 });
  }
  return groups;
}

function toSearchItemsFromIndex(items: VTuberIndexItem[]) {
  return items.map((item) => ({
    channelId: item.channelId,
    name: item.name,
    thumbnail: item.thumbnail,
    office: item.office,
    normalizedName: normalizeForSearch(item.name),
  }));
}

function toSearchItemsFromTabs(
  tabItems: VTuberTabItem[],
  officeGroups: VTuberOfficeGroup[] | undefined,
) {
  let groupIndex = 0;
  let countInGroup = 0;
  return tabItems.map((item) => {
    const group = officeGroups?.[groupIndex];
    const office = group?.name ?? "";
    countInGroup += 1;
    if (group && countInGroup >= group.count) {
      groupIndex += 1;
      countInGroup = 0;
    }
    return {
      channelId: item.channelId,
      name: item.name,
      thumbnail: item.thumbnail,
      office,
      normalizedName: normalizeForSearch(item.name),
    };
  });
}

function SearchInput({
  value,
  onChange,
  onKeyDown,
}: {
  value: string;
  onChange: (next: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="relative block">
      <Search
        size={16}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="VTuber名で探す"
        aria-label="VTuber名で探す"
        className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
    </label>
  );
}

export function VTuberTabs({ initialIndex, initialOfficeGroups }: VTuberTabsProps) {
  const { channelIds } = useSelectedChannels();
  const [index, setIndex] = useState<IndexState>(() =>
    initialIndex
      ? {
          status: "ready",
          items: toSearchItemsFromTabs(initialIndex, initialOfficeGroups),
          officeGroups: initialOfficeGroups ?? [],
        }
      : { status: "loading" },
  );
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchPinned, setSearchPinned] = useState<
    (VTuberTabItem & { office: string; normalizedName: string }) | null
  >(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (initialIndex) return;
    const ctrl = new AbortController();
    fetch("/api/vtuber", { signal: ctrl.signal })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<VTuberIndexItem[]>)
          : Promise.reject(r.status),
      )
      .then((items) =>
        setIndex({
          status: "ready",
          items: toSearchItemsFromIndex(items),
          officeGroups: buildOfficeGroupsFromIndex(items),
        }),
      )
      .catch(() => {
        if (!ctrl.signal.aborted) setIndex({ status: "error" });
      });
    return () => ctrl.abort();
  }, [initialIndex]);

  const normalizedQuery = useMemo(() => normalizeForSearch(query.trim()), [query]);
  const sel = useMemo(() => new Set(channelIds), [channelIds]);

  const members = useMemo(() => {
    if (index.status !== "ready") return [];
    return index.items.filter((m) => sel.has(m.channelId));
  }, [index, sel]);

  const allItemsById = useMemo(() => {
    if (index.status !== "ready") return new Map<string, typeof members[number]>();
    return new Map(index.items.map((item) => [item.channelId, item]));
  }, [index]);

  const current = useMemo(() => {
    if (index.status !== "ready") return null;
    if (active) return allItemsById.get(active) ?? null;
    return members[0] ?? null;
  }, [active, allItemsById, index, members]);

  const listItems = useMemo(() => {
    if (!searchPinned) return members;
    if (members.some((m) => m.channelId === searchPinned.channelId)) {
      return members;
    }
    return [searchPinned, ...members];
  }, [members, searchPinned]);

  const searchResults = useMemo(() => {
    if (index.status !== "ready" || !normalizedQuery) {
      return { items: [], overflow: 0 };
    }
    const matched = index.items.filter((item) =>
      item.normalizedName.includes(normalizedQuery),
    );
    return {
      items: matched.slice(0, 50),
      overflow: Math.max(0, matched.length - 50),
    };
  }, [index, normalizedQuery]);

  // 表示中の詳細に加えて、次のタブ 1 件分を先読みする
  useEffect(() => {
    if (!current) return;
    const i = members.findIndex((m) => m.channelId === current.channelId);
    const next = i >= 0 ? members[i + 1] : undefined;
    if (next) prefetchDetail(next.channelId);
  }, [members, current]);

  useEffect(() => {
    if (!searchPinned) return;
    if (!allItemsById.has(searchPinned.channelId) || sel.has(searchPinned.channelId)) {
      setSearchPinned(null);
    }
  }, [allItemsById, searchPinned, sel]);

  useEffect(() => {
    if (!active || normalizedQuery || members.length === 0) return;
    if (!members.some((m) => m.channelId === active)) return;
    tabRefs.current
      .get(active)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, members, normalizedQuery]);

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

  const showSearchResults = normalizedQuery.length > 0;
  const showLeftColumn = members.length > 0;

  const handleSearchSelect = (
    item: VTuberTabItem & { office: string; normalizedName: string },
  ) => {
    setQuery("");
    setActive(item.channelId);
    if (!sel.has(item.channelId)) {
      setSearchPinned(item);
      return;
    }
    setSearchPinned(null);
  };

  const handleTabSelect = (channelId: string) => {
    setActive(channelId);
    if (searchPinned && searchPinned.channelId !== channelId) {
      setSearchPinned(null);
    }
  };

  const renderSearchResults = (mobile: boolean) => (
    <div
      className={`rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${
        mobile ? "max-h-80 overflow-y-auto" : "min-h-0 flex-1 overflow-y-auto"
      }`}
    >
      {searchResults.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          該当するVTuberが見つかりません
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {searchResults.items.map((item) => {
            const outside = !sel.has(item.channelId);
            return (
              <li key={item.channelId}>
                <button
                  type="button"
                  onClick={() => handleSearchSelect(item)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {item.office}
                    </span>
                  </span>
                  {outside && (
                    <span className="shrink-0 rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                      選択外
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {searchResults.overflow > 0 && (
        <p className="border-t border-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">
          ほか {searchResults.overflow} 人（名前をもう少し入力してください）
        </p>
      )}
    </div>
  );

  const searchInput = (
    <SearchInput
      value={query}
      onChange={setQuery}
      onKeyDown={(e) => {
        if (e.key === "Escape") setQuery("");
      }}
    />
  );

  if (!showLeftColumn) {
    return (
      <div className="space-y-4">
        {searchInput}
        {showSearchResults ? (
          renderSearchResults(true)
        ) : current ? (
          <Detail channelId={current.channelId} />
        ) : (
          <p className="py-16 text-center text-zinc-500">
            Vtuberリストがありません（フィルターで事務所を選択してください）
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:items-start lg:gap-6">
      <div className="mb-4 space-y-2 lg:sticky lg:top-20 lg:mb-0 lg:flex lg:max-h-[calc(100vh-6rem)] lg:flex-col">
        {searchInput}
        {showSearchResults ? (
          renderSearchResults(false)
        ) : (
          <div
            role="tablist"
            className="flex gap-2 overflow-x-auto pb-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:rounded-xl lg:border lg:border-zinc-200 lg:bg-white lg:p-2 lg:shadow-sm dark:lg:border-zinc-800 dark:lg:bg-zinc-900"
          >
            {searchPinned && !sel.has(searchPinned.channelId) && (
              <div className="px-2 pb-1 text-xs text-zinc-500">検索から表示中</div>
            )}
            {listItems.map((m) => (
              <button
                key={m.channelId}
                ref={(el) => {
                  if (el) {
                    tabRefs.current.set(m.channelId, el);
                    return;
                  }
                  tabRefs.current.delete(m.channelId);
                }}
                role="tab"
                aria-selected={m.channelId === current?.channelId}
                onClick={() => handleTabSelect(m.channelId)}
                onPointerEnter={() => prefetchDetail(m.channelId)}
                onFocus={() => prefetchDetail(m.channelId)}
                className={`flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm lg:rounded-lg lg:py-2 ${
                  m.channelId === current?.channelId
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
        )}
      </div>
      {current ? (
        <Detail channelId={current.channelId} />
      ) : (
        <p className="py-16 text-center text-zinc-500">
          Vtuberリストがありません（フィルターで事務所を選択してください）
        </p>
      )}
    </div>
  );
}
