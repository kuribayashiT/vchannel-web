import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCurrentReportContext,
  getReportComment,
  getMonthlyReport,
} from "@/lib/reports";
import { formatNumber } from "@/lib/format";
import { OPERATOR_NAME, SITE_URL } from "@/lib/site";

type PageProps = { params: Promise<{ month: string }> };

const percentFormatter = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { month } = await params;
  const { month: currentMonth, date } = await getCurrentReportContext();
  const report = await getMonthlyReport(month, currentMonth, date);
  if (!report) notFound();

  return {
    title: report.title,
    description: `${month}の登録者増加、人気配信、誕生日・デビュー記念日を振り返る月間レポートです。`,
    alternates: { canonical: `/reports/${month}` },
    openGraph: { type: "article", title: report.title, url: `/reports/${month}` },
    twitter: { title: report.title },
  };
}

function monthLabel(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return `${year}年${value}月`;
}

function formattedDate(ymd: string | null): string {
  return ymd ?? "記録なし";
}

export default async function MonthlyReportPage({ params }: PageProps) {
  const { month } = await params;
  const { month: currentMonth, date } = await getCurrentReportContext();
  const report = await getMonthlyReport(month, currentMonth, date);
  if (!report) notFound();

  const commentHtml = getReportComment(month);
  const articleUrl = `${SITE_URL}/reports/${month}`;
  const publishedAt = `${month}-01`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: report.title,
    datePublished: publishedAt,
    dateModified: report.dataThrough ?? publishedAt,
    author: {
      "@type": "Organization",
      name: OPERATOR_NAME,
      url: `${SITE_URL}/about`,
    },
    mainEntityOfPage: articleUrl,
    url: articleUrl,
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <nav aria-label="パンくずリスト" className="mb-5 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ホーム
        </Link>
        <span className="mx-2" aria-hidden>
          ›
        </span>
        <Link href="/reports" className="hover:underline">
          月間レポート
        </Link>
        <span className="mx-2" aria-hidden>
          ›
        </span>
        <span aria-current="page">{monthLabel(month)}</span>
      </nav>

      <article>
        <header className="mb-7 border-b border-zinc-200 pb-5 dark:border-zinc-800">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight md:text-3xl">
            {report.title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {report.isCurrentMonth
              ? "今月分は集計途中です。データがそろった範囲の暫定レポートを掲載しています。"
              : "公開データをもとに、月内のVTuberの活動を振り返ります。"}
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            データ確認日：{formattedDate(report.dataThrough)} ・ 運営者：
            {OPERATOR_NAME}
          </p>
        </header>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />

        {commentHtml && (
          <section
            aria-labelledby="editor-comment-title"
            className="mb-8 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30"
          >
            <h2 id="editor-comment-title" className="mb-2 font-bold">
              編集部コメント
            </h2>
            <div
              className="space-y-3 text-sm leading-7 [&_a]:text-blue-700 [&_a]:underline dark:[&_a]:text-blue-300 [&_h2]:font-bold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: commentHtml }}
            />
          </section>
        )}

        {report.growth.length > 0 && (
          <section className="mb-9" aria-labelledby="growth-title">
            <h2 id="growth-title" className="mb-3 text-xl font-bold">
              登録者の伸び TOP10
            </h2>
            <p className="mb-4 leading-7">
              今月の登録者増加数1位は
              <Link
                href={`/vtuber/${report.growth[0].channelId}`}
                className="font-bold text-blue-700 underline dark:text-blue-300"
              >
                {report.growth[0].name}
              </Link>
              が {formatNumber(report.growth[0].growth)}人増え、伸び率は
              {percentFormatter.format(report.growth[0].rate)}% でした。
            </p>
            <ol className="space-y-2">
              {report.growth.map((item, index) => (
                <li
                  key={item.channelId}
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="w-7 shrink-0 text-sm font-bold text-zinc-500">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/vtuber/${item.channelId}`}
                      className="font-bold text-blue-700 hover:underline dark:text-blue-300"
                    >
                      {item.name}
                    </Link>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {item.office}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-sm font-semibold">
                    +{formatNumber(item.growth)}人
                    <span className="block text-xs font-normal text-zinc-500">
                      +{percentFormatter.format(item.rate)}%
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {report.officeGrowth.length > 0 && (
          <section className="mb-9" aria-labelledby="office-growth-title">
            <h2 id="office-growth-title" className="mb-3 text-xl font-bold">
              事務所別の伸び TOP5
            </h2>
            <ol className="space-y-2">
              {report.officeGrowth.map((item, index) => (
                <li
                  key={item.office}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span>
                    <span className="mr-3 text-sm text-zinc-500">
                      {index + 1}
                    </span>
                    <span className="font-medium">{item.office}</span>
                  </span>
                  <span className="shrink-0 font-semibold">
                    +{formatNumber(item.growth)}人
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {report.liveVideos.length > 0 && (
          <section className="mb-9" aria-labelledby="live-videos-title">
            <h2 id="live-videos-title" className="mb-2 text-xl font-bold">
              同時視聴者数の大きかった配信 TOP10
            </h2>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              週間ランキングに残っている対象月の配信から集計しています。
            </p>
            <ol className="space-y-2">
              {report.liveVideos.map((video, index) => (
                <li
                  key={video.videoId}
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="w-7 shrink-0 text-sm font-bold text-zinc-500">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/vtuber/${video.channelId}`}
                      className="font-bold text-blue-700 hover:underline dark:text-blue-300"
                    >
                      {video.channelTitle}
                    </Link>
                    <a
                      href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-sm hover:underline"
                    >
                      {video.title}
                    </a>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    {formatNumber(video.concurrentViewers)}人
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {(report.birthdays > 0 || report.debutAnniversaries > 0) && (
          <section className="mb-9" aria-labelledby="events-title">
            <h2 id="events-title" className="mb-2 text-xl font-bold">
              今月の誕生日・デビュー記念日
            </h2>
            <p className="mb-3 leading-7">
              {monthLabel(month)}は誕生日を迎えるVTuberが
              {report.birthdays}人、デビュー記念日を迎えるVTuberが
              {report.debutAnniversaries}人います。
            </p>
            <ol className="grid gap-2 sm:grid-cols-2">
              {report.eventPeople.map((person) => (
                <li
                  key={person.channelId || person.name}
                  className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {person.channelId ? (
                    <Link
                      href={`/vtuber/${person.channelId}`}
                      className="font-bold text-blue-700 hover:underline dark:text-blue-300"
                    >
                      {person.name}
                    </Link>
                  ) : (
                    <span className="font-bold">{person.name}</span>
                  )}
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {person.milestones.join("・")}
                  </span>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {person.office} ・ 登録者 {formatNumber(person.subscriberCount)}人
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>
    </main>
  );
}
