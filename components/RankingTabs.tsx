"use client";

import { smallAvatar } from "@/lib/url";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useSelectedChannels } from "@/hooks/useSelection";
import {
  RANKING_TABS,
  growthHeading,
  growthRows,
  subscriberRows,
  videoCountRows,
  weeklyHeading,
  weeklyRows,
  type RankingRow,
  type RankingTab,
} from "@/lib/ranking";
import {
  buildRankingQuery,
  parseRankingQuery,
  type RankingQueryTab,
  type RankingViewState,
} from "@/lib/rankingQuery";
import type {
  GrowthPeriod,
  SubscriberGrowthData,
  Video,
  VideoCountRankingItem,
  YoutubeSubscriberRankingItem,
} from "@/types";

interface Props {
  weekly: Video[];
  subscribers: YoutubeSubscriberRankingItem[];
  videoCounts: VideoCountRankingItem[];
  /** 推移データの取得に失敗したときは null */
  growth: SubscriberGrowthData | null;
}

const PAGE = 100;
const noopSubscribe = () => () => {};

const MEDALS = ["🥇", "🥈", "🥉"];

/** 動画本数タブのキー（weekly / subscribers / growth 以外の残り 1 つ） */
const VIDEO_TAB: RankingTab =
  RANKING_TABS.find(
    (t) =>
      t.key !== "weekly" && t.key !== "subscribers" && t.key !== "growth",
  )?.key ?? "weekly";

function toRankingTab(q: RankingQueryTab): RankingTab {
  if (q === "live") return "weekly";
  if (q === "subscribers") return "subscribers";
  if (q === "growth") return "growth";
  return VIDEO_TAB;
}

function fromRankingTab(t: RankingTab): RankingQueryTab {
  if (t === "weekly") return "live";
  if (t === "subscribers") return "subscribers";
  if (t === "growth") return "growth";
  return "videos";
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const W = 64;
  const H = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = span === 0 ? H / 2 : H - 2 - ((v - min) / span) * (H - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      aria-hidden
      className="hidden shrink-0 sm:block"
    >
      <polyline points={pts} fill="none" stroke="#10b981" strokeWidth="1.5" />
    </svg>
  );
}

function Row({ r, rank }: { r: RankingRow; rank: number }) {
  const isGrowth = r.rate !== undefined;
  const body = (
    <>
      <span className="w-8 shrink-0 text-center font-bold">
        {isGrowth && rank <= 3 ? MEDALS[rank - 1] : rank}
      </span>
      {r.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={smallAvatar(r.thumbnail)}
          referrerPolicy="no-referrer"
          alt=""
          loading="lazy"
          className="size-11 shrink-0 rounded-full object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{r.name}</p>
        <p className="truncate text-xs text-zinc-500">{r.sub ?? r.office}</p>
      </div>
      {isGrowth ? (
        <>
          {r.spark && <Sparkline data={r.spark} />}
          <div className="shrink-0 text-right tabular-nums">
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              +{r.value.toLocaleString()}
              {r.unit}
            </p>
            <p className="text-xs text-zinc-500">+{r.rate!.toFixed(2)}%</p>
          </div>
        </>
      ) : (
        <span className="shrink-0 text-sm font-bold tabular-nums">
          {r.value.toLocaleString()}
          {r.unit}
        </span>
      )}
    </>
  );
  const cls =
    "flex items-center gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800";
  return r.videoId ? (
    <a
      href={`https://www.youtube.com/watch?v=${r.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${cls} hover:bg-zinc-100 dark:hover:bg-zinc-900`}
    >
      {body}
    </a>
  ) : r.channelId ? (
    <Link
      href={`/vtuber/${encodeURIComponent(r.channelId)}`}
      className={`${cls} hover:bg-zinc-100 dark:hover:bg-zinc-900`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function RankingTabs({
  weekly,
  subscribers,
  videoCounts,
  growth,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // タブ・期間の状態は URL（クエリ）が唯一の情報源。戻る/進む・リロードにも追従する
  const view = useMemo(() => parseRankingQuery(searchParams), [searchParams]);
  const tab = toRankingTab(view.tab);
  const period: GrowthPeriod = view.period;
  const viewKey = `${view.tab}:${view.period}`;

  // 表示件数はタブ/期間が変わったら既定値に戻す
  const [limitState, setLimitState] = useState({ key: viewKey, n: PAGE });
  const limit = limitState.key === viewKey ? limitState.n : PAGE;

  const { channelIds } = useSelectedChannels();
  // 見出しの日付は現在時刻依存のため、マウント後にのみ表示する
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rows = useMemo(() => {
    if (tab === "weekly") return weeklyRows(weekly, channelIds);
    if (tab === "growth")
      return growth ? growthRows(growth[period].items, channelIds) : [];
    if (tab === "subscribers") return subscriberRows(subscribers, channelIds);
    return videoCountRows(videoCounts, channelIds);
  }, [tab, period, weekly, growth, subscribers, videoCounts, channelIds]);

  // 履歴を汚さないよう、タブ・期間の切替はどちらも replace で URL を更新する
  const navigate = (next: RankingViewState) => {
    const q = buildRankingQuery(next);
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const changePeriod = (p: GrowthPeriod) => {
    navigate({ tab: "growth", period: p });
  };

  const changeTab = (t: RankingTab) => {
    navigate({ tab: fromRankingTab(t), period: "week" });
  };

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-2 overflow-x-auto">
        {RANKING_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab}
            onClick={() => changeTab(t.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm ${
              t.key === tab
                ? "bg-blue-600 text-white"
                : "bg-zinc-200 dark:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "weekly" && mounted && (
        <h2 className="mb-2 text-sm font-bold">{weeklyHeading(new Date())}</h2>
      )}
      {tab === "growth" && growth && (
        <>
          <div
            role="radiogroup"
            aria-label="集計期間"
            className="mb-3 flex gap-2"
          >
            {(
              [
                ["week", "週間"],
                ["month", "月間"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={period === key}
                onClick={() => changePeriod(key)}
                className={`rounded-full px-4 py-1 text-sm ${
                  period === key
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-200 dark:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {growth[period].to && (
            <h2 className="mb-2 text-sm font-bold">
              {growthHeading(growth[period].from, growth[period].to)}
            </h2>
          )}
        </>
      )}
      {tab === "growth" && !growth ? (
        <p className="py-16 text-center text-zinc-500">
          急上昇データの読み込みに失敗しました。
        </p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">
          ランキングデータがありません
        </p>
      ) : (
        <>
          <div className="grid gap-x-4 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm md:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900">
            {rows.slice(0, limit).map((r, i) => (
              <Row key={r.key} r={r} rank={i + 1} />
            ))}
          </div>
          {limit < rows.length && (
            <button
              type="button"
              onClick={() => setLimitState({ key: viewKey, n: limit + PAGE })}
              className="mx-auto mt-4 block rounded border border-zinc-300 px-6 py-2 text-sm dark:border-zinc-700"
            >
              さらに表示
            </button>
          )}
        </>
      )}
      {tab === "growth" && growth && rows.length > 0 && (
        <p className="mt-4 text-xs text-zinc-500">
          ※YouTubeの登録者数は概数で公開されるため、増加数は目安です
        </p>
      )}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="トップへ戻る"
        className="fixed bottom-20 right-4 md:bottom-6 size-12 rounded-full bg-blue-600 text-white shadow-lg"
      >
        ↑
      </button>
    </div>
  );
}
