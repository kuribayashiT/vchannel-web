import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { Newspaper } from "lucide-react";
import { NewsExternalLink } from "@/components/NewsExternalLink";
import { NewsClusterCard } from "@/components/NewsClusterCard";
import { NewsList } from "@/components/NewsList";
import { getCachedNewsClusters } from "@/lib/server-data";

export const metadata: Metadata = {
  title: "ニュース",
  alternates: { canonical: "/news" },
};

const hhmmFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

function parseNewsDate(value: string): number {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return Date.parse(value.replace(" ", "T") + "+09:00");
  }
  return Date.parse(value);
}

function isWithin48Hours(latestAt: string, now: number): boolean {
  const ms = parseNewsDate(latestAt);
  if (!Number.isFinite(ms)) return false;
  return now - ms <= 48 * 3_600_000;
}

function formatLastUpdated(latestAt: string): string | null {
  const ms = parseNewsDate(latestAt);
  if (!Number.isFinite(ms)) return null;
  return hhmmFmt.format(ms);
}

async function getCachedNewsNow(): Promise<number> {
  "use cache";
  cacheLife({ stale: 600, revalidate: 600, expire: 3600 });
  return Date.now();
}

export default async function NewsPage() {
  const clusters = await getCachedNewsClusters();
  const now = await getCachedNewsNow();
  const lastUpdated = clusters?.[0] ? formatLastUpdated(clusters[0].latestAt) : null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">ニュース</h1>
      {!clusters ? (
        <div className="py-16 text-center text-zinc-500">
          <p>ニュースデータの取得に失敗しました（空データ）</p>
          <Link
            href="/news"
            className="mt-4 inline-block rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            再読み込み
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            VTuber 関連のニュースを、同じ話題ごとにまとめて新しい順に並べています。事務所や企業の発表には「公式」と表示します。
            {lastUpdated && (
              <span className="ml-2 text-xs text-zinc-500">
                最終更新 {lastUpdated}
              </span>
            )}
          </p>

          {(() => {
            const highlights = clusters
              .filter((cluster) => isWithin48Hours(cluster.latestAt, now))
              .filter((cluster) => cluster.sourceCount >= 2)
              .sort((a, b) => b.score - a.score)
              .slice(0, 3);
            if (highlights.length === 0) return null;
            return (
              <section className="mt-5">
                <h2 className="mb-3 text-base font-bold">今日の注目</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {highlights.map((cluster) => (
                    <div key={cluster.id} className="space-y-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                        <Newspaper size={12} />
                        {cluster.sourceCount}媒体が報道
                      </span>
                      <NewsClusterCard cluster={cluster} isFavorite={false} featured />
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}

          {(() => {
            const readOnVchannel = clusters
              .filter((cluster) => cluster.clicks >= 3)
              .sort((a, b) => b.clicks - a.clicks)
              .slice(0, 5);
            if (readOnVchannel.length === 0) return null;
            return (
              <section className="mt-5">
                <h2 className="mb-3 text-base font-bold">Vちゃんねるで読まれている</h2>
                <ol className="space-y-2">
                  {readOnVchannel.map((cluster, index) => (
                    <li
                      key={cluster.id}
                      className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <span className="w-5 shrink-0 text-center text-xs font-semibold text-zinc-500">
                        {index + 1}
                      </span>
                      <NewsExternalLink
                        id={cluster.lead.id}
                        href={cluster.lead.url}
                        className="min-w-0 flex-1 truncate text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                      >
                        {cluster.lead.title}
                      </NewsExternalLink>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {cluster.clicks}回
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })()}

          <NewsList clusters={clusters} />
        </>
      )}
    </main>
  );
}
