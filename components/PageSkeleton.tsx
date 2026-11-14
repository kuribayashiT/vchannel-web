import { Skeleton } from "@/components/Skeleton";

type PageSkeletonProps = {
  variant: "list" | "grid" | "detail";
  maxWidth?: "4xl" | "6xl";
};

const MAIN_CLASS =
  "mx-auto w-full flex-1 px-4 py-5 md:px-6 md:py-8";
const MAX_WIDTH_CLASS = {
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
} as const;

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function ListSkeleton() {
  return (
    <>
      <div aria-hidden className="mb-5 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div aria-hidden className="space-y-3">
        {range(8).map((index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-zinc-200 py-3 dark:border-zinc-800"
          >
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </>
  );
}

function GridSkeleton() {
  return (
    <>
      <div aria-hidden className="mb-5 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div
        aria-hidden
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {range(12).map((index) => (
          <div
            key={index}
            className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div aria-hidden className="mb-3 flex items-center gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div aria-hidden className="mb-5 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div
        aria-hidden
        className="mb-6 flex items-center gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <div aria-hidden className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-32 w-full" />
      </div>
    </>
  );
}

export function PageSkeleton({
  variant,
  maxWidth = "6xl",
}: PageSkeletonProps) {
  return (
    <main
      aria-busy="true"
      className={`${MAIN_CLASS} ${MAX_WIDTH_CLASS[maxWidth]}`}
    >
      <span className="sr-only">読み込み中</span>
      {variant === "list" && <ListSkeleton />}
      {variant === "grid" && <GridSkeleton />}
      {variant === "detail" && <DetailSkeleton />}
    </main>
  );
}
