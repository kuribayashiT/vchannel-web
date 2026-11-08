"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { X, CalendarDays, Settings, SlidersHorizontal, Star } from "lucide-react";
import { BottomNav, TopNav } from "@/components/BottomNav";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { OfficeSelector } from "@/components/OfficeSelector";
import { useSelectedChannels } from "@/hooks/useSelection";
import type { OfficeSummary } from "@/lib/offices";

function SideMenu({
  offices,
  onClose,
}: {
  offices: OfficeSummary[];
  onClose: () => void;
}) {
  const { channelIds, setChannelIds } = useSelectedChannels();

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <aside
        aria-label="フィルター"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-80 max-w-full flex-col gap-3 bg-white p-4 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold">フィルター</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="px-2 text-lg"
          >
            <X size={18} />
          </button>
        </div>
        <OfficeSelector
          offices={offices}
          selected={channelIds}
          onChange={setChannelIds}
        />
      </aside>
    </div>
  );
}

const FOOTER_METRICS: { term: string; desc: string }[] = [
  {
    term: "登録者数・増加数",
    desc: "YouTube が公開する登録者数（概数）をもとにしています。増加数・増加率は日次の記録の差分から算出する目安です。",
  },
  {
    term: "同時視聴者数",
    desc: "配信中の動画について、データ取得時点の同時視聴者数を表示します。数分おきに更新されるため、実際の人数とは差が出ることがあります。",
  },
  {
    term: "週間同時視聴者数ランキング",
    desc: "直近 7 日間に配信された動画の同時視聴者数をもとに集計しています。",
  },
  {
    term: "データの更新頻度",
    desc: "配信情報は約 5 分、ランキング・ニュースなどは 1 時間程度を目安に更新します。",
  },
];

const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: "/ranking", label: "ランキング" },
  { href: "/news", label: "ニュース" },
  { href: "/events", label: "イベントカレンダー" },
  { href: "/settings", label: "設定・アプリ情報" },
];

/** 指標の定義・データ出典・注意書きを表示するフッター */
function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 text-xs leading-relaxed text-zinc-500 md:px-6 dark:text-zinc-400">
        <section aria-labelledby="footer-metrics">
          <h2
            id="footer-metrics"
            className="mb-2 text-sm font-bold text-zinc-700 dark:text-zinc-200"
          >
            指標について
          </h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {FOOTER_METRICS.map((m) => (
              <div key={m.term}>
                <dt className="font-medium text-zinc-700 dark:text-zinc-300">
                  {m.term}
                </dt>
                <dd>{m.desc}</dd>
              </div>
            ))}
          </dl>
        </section>
        <p>
          当サイトは YouTube などの公開情報をもとにした非公式のファンサイトです。
          掲載データの正確性・完全性は保証できません。各 VTuber・事務所・配信プラットフォームとは関係ありません。
        </p>
        <nav aria-label="フッターナビゲーション">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-[11px]">© Vちゃんねる</p>
      </div>
    </footer>
  );
}

export function AppShell({
  offices,
  children,
}: {
  offices: OfficeSummary[];
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 md:px-6">
          <Link
            href="/"
            className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-lg font-extrabold tracking-tight text-transparent"
          >
            Vちゃんねる
          </Link>
          <Suspense fallback={null}>
            <TopNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href="/favorites"
              aria-label="お気に入り"
              className="rounded-full px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Star size={18} />
            </Link>
            <Link
              href="/events"
              aria-label="イベントカレンダー"
              className="rounded-full px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <CalendarDays size={18} />
            </Link>
            <Link
              href="/settings"
              aria-label="設定"
              className="rounded-full px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Settings size={18} />
            </Link>
            <button
              type="button"
              aria-label="フィルター"
              onClick={() => setMenuOpen(true)}
              disabled={offices.length === 0}
              className="ml-1 flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-sm sm:px-4 font-medium text-white disabled:opacity-40"
            >
              <SlidersHorizontal size={16} aria-hidden />
              <span className="hidden sm:inline">フィルター</span>
            </button>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col pb-16 md:pb-0">
        {children}
        <SiteFooter />
      </div>
      <YouTubePlayer />
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
      {menuOpen && (
        <SideMenu
          offices={offices}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}
