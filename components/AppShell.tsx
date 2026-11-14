"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { X, CalendarDays, Settings, SlidersHorizontal, Star } from "lucide-react";
import { BottomNav, TopNav } from "@/components/BottomNav";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { OfficeSelector } from "@/components/OfficeSelector";
import { resetSelection, useSelectedChannels } from "@/hooks/useSelection";
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

/** 絞り込み中（選択が空でない）のときだけ表示するチップ。タップでフィルターを開き、× で全件表示に戻す */
function FilterChip({ onOpen }: { onOpen: () => void }) {
  const { channelIds } = useSelectedChannels();
  if (channelIds.length === 0) return null;

  return (
    <div className="flex items-center overflow-hidden rounded-full border border-violet-300 bg-violet-50 text-xs font-medium text-violet-800 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`絞り込み中 ${channelIds.length}人。フィルターを開く`}
        className="whitespace-nowrap py-1 pl-2.5 pr-1 hover:bg-violet-100 dark:hover:bg-violet-900/40"
      >
        <span className="sm:hidden">{channelIds.length}人</span>
        <span className="hidden sm:inline">絞り込み中 {channelIds.length}人</span>
      </button>
      <button
        type="button"
        onClick={() => resetSelection()}
        aria-label="絞り込みを解除して全件表示に戻す"
        className="flex items-center py-1 pl-1 pr-2 hover:bg-violet-100 dark:hover:bg-violet-900/40"
      >
        <X size={12} aria-hidden />
      </button>
    </div>
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
            className="shrink-0 whitespace-nowrap bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-lg font-extrabold tracking-tight text-transparent"
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
            <div className="ml-1">
              <FilterChip onOpen={() => setMenuOpen(true)} />
            </div>
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
