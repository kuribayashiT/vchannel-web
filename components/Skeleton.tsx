import type { ReactNode } from "react";

/** 共通のスケルトンブロック。サイズ・形状は className で指定する（例: "h-4 w-32"） */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800 ${className}`}
    />
  );
}

/**
 * スケルトン群のラッパー。スクリーンリーダーには label のみを読み上げ、
 * 個々のブロックは aria-hidden で隠す。
 */
export function SkeletonGroup({
  label = "読み込み中…",
  className = "",
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function range(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => i);
}

/** 動画カード（VideoCard）と同じ骨格 */
export function VideoCardSkeleton() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

/** 配信タブ・VTuber 詳細の動画一覧用グリッド（StreamTabs と同じ列構成） */
export function VideoGridSkeleton({
  count = 8,
  label = "配信予定を読み込み中…",
}: {
  count?: number;
  label?: string;
}) {
  return (
    <SkeletonGroup label={label}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {range(count).map((i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** タブ（ピル）列のスケルトン */
export function TabsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div aria-hidden className="mb-4 flex gap-2 overflow-hidden">
      {range(count).map((i) => (
        <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
      ))}
    </div>
  );
}

/** ランキング 1 行分 */
function RankingRowSkeleton() {
  return (
    <div
      aria-hidden
      className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
    >
      <Skeleton className="h-5 w-8 shrink-0" />
      <Skeleton className="size-11 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-4 w-14 shrink-0" />
    </div>
  );
}

/** ランキング一覧（RankingTabs と同じ 2 列・枠線構成） */
export function RankingListSkeleton({
  count = 10,
  withTabs = true,
}: {
  count?: number;
  withTabs?: boolean;
}) {
  return (
    <SkeletonGroup label="ランキングを読み込み中…">
      {withTabs && <TabsSkeleton count={4} />}
      <div className="grid gap-x-4 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm md:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900">
        {range(count).map((i) => (
          <RankingRowSkeleton key={i} />
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** ニュースカード 1 件分 */
function NewsCardSkeleton() {
  return (
    <div
      aria-hidden
      className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex gap-3">
        <Skeleton className="h-20 w-32 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

/** ニュース一覧（app/news/page.tsx と同じ 2 列グリッド） */
export function NewsListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <SkeletonGroup label="ニュースを読み込み中…">
      <div className="grid gap-3 md:grid-cols-2">
        {range(count).map((i) => (
          <NewsCardSkeleton key={i} />
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** VTuber 詳細（ヘッダー・指標 3 つ・グラフ・動画グリッド） */
export function VTuberDetailSkeleton() {
  return (
    <SkeletonGroup label="Vtuberリストを読み込み中…" className="space-y-6">
      <div
        aria-hidden
        className="flex items-center gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <div aria-hidden className="grid grid-cols-3 gap-2">
        {range(3).map((i) => (
          <div
            key={i}
            className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <Skeleton className="mx-auto h-3 w-12" />
            <Skeleton className="mx-auto h-5 w-16" />
          </div>
        ))}
      </div>
      <div aria-hidden className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
      <div aria-hidden className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {range(3).map((i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}

/** VTuber 一覧（タブ列＋詳細）。lg 以上は左サイドのタブ列を模す */
export function VTuberTabsSkeleton() {
  return (
    <SkeletonGroup label="Vtuberリストを読み込み中…">
      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:items-start lg:gap-6">
        <div aria-hidden className="mb-4 flex gap-2 overflow-hidden lg:mb-0 lg:flex-col">
          {range(6).map((i) => (
            <Skeleton
              key={i}
              className="h-9 w-32 shrink-0 rounded-full lg:w-full lg:rounded-lg"
            />
          ))}
        </div>
        <VTuberDetailSkeleton />
      </div>
    </SkeletonGroup>
  );
}
