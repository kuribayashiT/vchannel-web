import Link from "next/link";
import { BarChart3, BookOpen, ChevronRight, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getAllGuides } from "@/lib/guide";
import { getCurrentReportContext } from "@/lib/reports";

type ReadingLinkItem = {
  key: string;
  href: string;
  Icon: LucideIcon;
  label: string;
  title: string;
  chipLabel: string;
};

export async function ReadingLinks({ variant }: { variant: "card" | "chips" }) {
  const guides = await getAllGuides();
  const feature = guides.find((guide) => guide.category === "特集");
  const { month } = await getCurrentReportContext();
  const monthNumber = Number(month.slice(5, 7));

  const featureItem: ReadingLinkItem = feature
    ? {
        key: "feature",
        href: `/guide/${feature.slug}`,
        Icon: Sparkles,
        label: "最新の特集",
        title: feature.title,
        chipLabel: "最新の特集",
      }
    : {
        key: "feature",
        href: "/guide",
        Icon: BookOpen,
        label: "ガイド・特集",
        title: "VTuberの楽しみ方とデータの読み方",
        chipLabel: "ガイド・特集",
      };

  const reportItem: ReadingLinkItem = {
    key: "report",
    href: `/reports/${month}`,
    Icon: BarChart3,
    label: "月間レポート",
    title: `${monthNumber}月のVTuber月間レポート`,
    chipLabel: `${monthNumber}月の月間レポート`,
  };

  const items: ReadingLinkItem[] = [featureItem, reportItem];

  if (variant === "chips") {
    return (
      <nav aria-label="読みもの" className="flex flex-wrap gap-2">
        {items.map(({ key, href, Icon, label, title, chipLabel }) => (
          <Link
            key={key}
            href={href}
            aria-label={`${label} ${title}`}
            className="inline-flex min-h-9 touch-manipulation items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-700 transition hover:border-violet-400 hover:text-violet-700 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-violet-500 dark:hover:text-violet-300 dark:active:bg-zinc-800"
          >
            <Icon size={14} aria-hidden="true" className="shrink-0" />
            <span>{chipLabel}</span>
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <section aria-label="読みもの">
      <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {items.map(({ key, href, Icon, label, title }) => (
          <Link
            key={key}
            href={href}
            className="flex min-h-11 touch-manipulation items-center gap-3 px-3 py-2 transition active:bg-zinc-50 dark:active:bg-zinc-800"
          >
            <Icon
              size={20}
              aria-hidden="true"
              className="shrink-0 text-violet-600 dark:text-violet-400"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {label}
              </span>
              <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {title}
              </span>
            </span>
            <ChevronRight
              size={18}
              aria-hidden="true"
              className="shrink-0 text-zinc-400 dark:text-zinc-500"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
