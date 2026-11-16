import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { XPostCard } from "@/components/admin/XPostCard";
import { buildXPostDrafts, type XPostDraft } from "@/lib/admin/xPosts";
import { dayKey, formatDateSlug, mergeEvents, parseDateSlug, shiftDateSlug, todayJstParts } from "@/lib/events";
import { getEventList, getYoutubeSubscriberRanking } from "@/lib/gcs";
import { getGrowthData } from "@/lib/growth-data";
import { SITE_URL } from "@/lib/site";
import type { SubscriberGrowthItem, VEvent } from "@/types";

type PageProps = { searchParams: Promise<{ date?: string }> };

/** X 投稿案。認証は proxy.ts、仕様は FRONTEND_SPEC.md 5.12.1 */
export default function XPostsPage({ searchParams }: PageProps) {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-[65] border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Link
            href="/admin"
            aria-label="VTuber 管理に戻る"
            className="rounded-md p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="font-extrabold">X 投稿案</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <Suspense fallback={<p className="text-sm text-zinc-500">読み込み中…</p>}>
          <Drafts searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function settle<T>(p: Promise<T>, fallback: T): Promise<{ value: T; error: boolean }> {
  try {
    return { value: await p, error: false };
  } catch (e) {
    console.error("[admin/x]", e);
    return { value: fallback, error: true };
  }
}

async function Drafts({ searchParams }: PageProps) {
  await connection();
  const sp = await searchParams;
  const today = todayJstParts();
  const target = (sp.date && parseDateSlug(sp.date)) || { month: today.m, day: today.d };
  const slug = formatDateSlug(target.month, target.day);
  const isToday = target.month === today.m && target.day === today.d;

  const emptyGrowth = { from: "", to: "", items: [] as SubscriberGrowthItem[] };
  const [events, ranking, growth] = await Promise.all([
    settle(
      getEventList().then((list) => mergeEvents(list).get(dayKey(target.month, target.day)) ?? []),
      [] as VEvent[],
    ),
    settle(getYoutubeSubscriberRanking(), []),
    settle(getGrowthData().then((g) => g.week), emptyGrowth),
  ]);

  const drafts: XPostDraft[] = buildXPostDrafts({
    siteUrl: SITE_URL,
    month: target.month,
    day: target.day,
    year: today.y,
    events: events.value,
    subscribers: new Map(ranking.value.map((r) => [r.channelId, r.youtubeSubscriberCount])),
    weekGrowth: growth.value,
  });
  const failed = [
    events.error && "イベント",
    ranking.error && "登録者数",
    growth.error && "急上昇",
  ].filter(Boolean);

  const prev = shiftDateSlug(slug, -1) ?? "12-31";
  const next = shiftDateSlug(slug, 1) ?? "01-01";
  const nav =
    "flex items-center rounded-md p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800";

  return (
    <>
      <div className="flex items-center gap-2">
        <Link href={`/admin/x?date=${prev}`} aria-label="前日" className={nav}>
          <ChevronLeft size={18} />
        </Link>
        <h2 className="text-lg font-bold">
          {target.month}月{target.day}日{isToday ? "（今日）" : ""}
        </h2>
        <Link href={`/admin/x?date=${next}`} aria-label="翌日" className={nav}>
          <ChevronRight size={18} />
        </Link>
        {!isToday && (
          <Link href="/admin/x" className="ml-auto text-sm text-blue-600 hover:underline dark:text-blue-400">
            今日に戻る
          </Link>
        )}
      </div>
      <p className="text-xs leading-5 text-zinc-500">
        「X で投稿」を押すと、本文が入った X の投稿画面が開きます（X API は使わないので無料）。本文はここで直してから投稿できます。
        リンクには <code>utm_source=x</code> が付き、Vercel Analytics の UTM で効果を確認できます。1 日 1〜3 件が目安です。
      </p>
      {failed.length > 0 && (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {failed.join("・")}のデータを取得できませんでした。再読み込みしてください。
        </p>
      )}
      {drafts.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">この日の投稿案はありません。</p>
      ) : (
        drafts.map((d) => <XPostCard key={`${slug}-${d.id}`} draft={d} />)
      )}
    </>
  );
}
