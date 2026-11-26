"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { X, CalendarDays, Settings, SlidersHorizontal, Star } from "lucide-react";
import { BottomNav, TopNav } from "@/components/BottomNav";
import { LinkPendingIndicator } from "@/components/LinkPendingIndicator";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { OfficeSelector } from "@/components/OfficeSelector";
import { SiteFooter } from "@/components/SiteFooter";
import { resetSelection, useSelectedChannels } from "@/hooks/useSelection";
import type { OfficeSummary } from "@/lib/offices";

const SELECTED_IDS_KEY = "selectedChannelIds";
const MIGRATED_KEY = "selectionMigratedV1";
const LEGACY_FULL_SELECTION_RATIO = 0.95;
const OFFICES_API = "/api/offices";
let officesPromise: Promise<OfficeSummary[]> | null = null;

function isOfficeMember(value: unknown): value is OfficeSummary["members"][number] {
  if (!value || typeof value !== "object") return false;
  const member = value as { channelId?: unknown; name?: unknown };
  return typeof member.channelId === "string" && typeof member.name === "string";
}

function isOfficeSummary(value: unknown): value is OfficeSummary {
  if (!value || typeof value !== "object") return false;
  const office = value as { name?: unknown; thumbnail?: unknown; members?: unknown };
  return (
    typeof office.name === "string" &&
    (office.thumbnail === undefined || typeof office.thumbnail === "string") &&
    Array.isArray(office.members) &&
    office.members.every(isOfficeMember)
  );
}

function loadOffices(): Promise<OfficeSummary[]> {
  if (!officesPromise) {
    officesPromise = fetch(OFFICES_API)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("failed to load offices");
        }
        const data: unknown = await res.json();
        if (!Array.isArray(data) || !data.every(isOfficeSummary)) {
          throw new Error("invalid offices response");
        }
        return data;
      })
      .catch((error) => {
        officesPromise = null;
        throw error;
      });
  }
  return officesPromise;
}

/**
 * 旧 UI の「全選択」で全 ID が保存されたままの人を「すべて表示」（空）に戻す。
 * 1 回だけ実行する（実行済みフラグ selectionMigratedV1）。
 * 保存中の ID のうち現在も存在するものが全 ID の 95% 以上なら resetSelection() する。
 */
function migrateLegacyFullSelection(allIds: readonly string[]): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY) === "1") return;
    // 全 ID が分からないときは判定できないので、フラグも書かずに次回へ回す
    if (allIds.length === 0) return;

    const raw = localStorage.getItem(SELECTED_IDS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const all = new Set(allIds);
        const kept = new Set<string>();
        for (const id of parsed) {
          if (typeof id === "string" && all.has(id)) kept.add(id);
        }
        if (kept.size >= all.size * LEGACY_FULL_SELECTION_RATIO) {
          resetSelection();
        }
      }
    }
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // localStorage が使えない・値が壊れている場合は何もしない
  }
}

function SideMenu({
  onClose,
}: {
  onClose: () => void;
}) {
  const { channelIds, setChannelIds } = useSelectedChannels();
  const [offices, setOffices] = useState<OfficeSummary[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    void loadOffices()
      .then((next) => {
        if (cancelled) return;
        setOffices(next);
        setState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
        {state === "loading" && (
          <p className="py-6 text-center text-sm text-zinc-500">読み込み中…</p>
        )}
        {state === "error" && (
          <div className="space-y-3 py-6 text-center text-sm">
            <p className="text-zinc-500">読み込みに失敗しました</p>
            <button
              type="button"
              onClick={() => {
                setState("loading");
                void loadOffices()
                  .then((next) => {
                    setOffices(next);
                    setState("ready");
                  })
                  .catch(() => {
                    setState("error");
                  });
              }}
              className="rounded-full border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              再読み込み
            </button>
          </div>
        )}
        {state === "ready" && (
          <OfficeSelector
            offices={offices}
            selected={channelIds}
            onChange={setChannelIds}
          />
        )}
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
  children,
}: {
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // マウント時に 1 回だけ、旧「全選択」の全 ID 保存を「すべて表示」に戻す（FILTER-9）
  useEffect(() => {
    try {
      if (localStorage.getItem(MIGRATED_KEY) === "1") return;
      const raw = localStorage.getItem(SELECTED_IDS_KEY);
      if (!raw) {
        localStorage.setItem(MIGRATED_KEY, "1");
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        localStorage.setItem(MIGRATED_KEY, "1");
        return;
      }
      void loadOffices()
        .then((offices) => {
          const allIds = offices.flatMap((o) => o.members.map((m) => m.channelId));
          migrateLegacyFullSelection(allIds);
        })
        .catch(() => {
          // 取得失敗時は次回マウントで再試行
        });
    } catch {
      // localStorage が使えない場合は何もしない
    }
  }, []);

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
              <LinkPendingIndicator>
                <Star size={18} />
              </LinkPendingIndicator>
            </Link>
            <Link
              href="/events"
              aria-label="イベントカレンダー"
              className="rounded-full px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <LinkPendingIndicator>
                <CalendarDays size={18} />
              </LinkPendingIndicator>
            </Link>
            <Link
              href="/settings"
              aria-label="設定"
              className="rounded-full px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <LinkPendingIndicator>
                <Settings size={18} />
              </LinkPendingIndicator>
            </Link>
            <div className="ml-1">
              <FilterChip onOpen={() => setMenuOpen(true)} />
            </div>
            <button
              type="button"
              aria-label="フィルター"
              onClick={() => setMenuOpen(true)}
              className="ml-1 flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-sm sm:px-4 font-medium text-white"
            >
              <SlidersHorizontal size={16} aria-hidden />
              <span className="hidden sm:inline">フィルター</span>
            </button>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
      <SiteFooter />
      <YouTubePlayer />
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
      {menuOpen && <SideMenu onClose={() => setMenuOpen(false)} />}
    </>
  );
}
