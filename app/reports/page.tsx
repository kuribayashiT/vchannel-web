import type { Metadata } from "next";
import Link from "next/link";
import {
  getCurrentReportContext,
  getReportMonths,
} from "@/lib/reports";

const PAGE_TITLE = "VTuber月間レポート";
const PAGE_DESCRIPTION =
  "登録者の伸び、人気配信、誕生日やデビュー記念日を月ごとに振り返るレポートです。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/reports" },
  openGraph: { title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: "/reports" },
  twitter: { title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

function monthLabel(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return `${year}年${value}月`;
}

export default async function ReportsIndexPage() {
  const { month: currentMonth } = await getCurrentReportContext();
  const months = await getReportMonths(currentMonth);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <nav aria-label="パンくずリスト" className="mb-4 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ホーム
        </Link>
        <span className="mx-2" aria-hidden>
          ›
        </span>
        <span aria-current="page">月間レポート</span>
      </nav>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">
        VTuber月間レポート
      </h1>
      <p className="mb-6 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        登録者の伸びや月内に確認できる人気配信、誕生日・デビュー記念日を振り返ります。
        今月分は集計途中のデータです。
      </p>

      <ol className="space-y-3">
        {months.map((month) => {
          const current = month === currentMonth;
          return (
            <li key={month}>
              <Link
                href={`/reports/${month}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 hover:border-blue-400 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="font-bold">{monthLabel(month)}</span>
                <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
                  {current ? "集計中" : "月間レポート"} →
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
