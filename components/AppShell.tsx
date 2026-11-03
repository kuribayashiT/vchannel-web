"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { OfficeSelector } from "@/components/OfficeSelector";
import { useOnboardingDone, useSelectedChannels } from "@/hooks/useSelection";
import type { OfficeSummary } from "@/lib/offices";

function OnboardingDialog({
  offices,
  editing,
  onClose,
}: {
  offices: OfficeSummary[];
  editing: boolean;
  onClose: () => void;
}) {
  const { channelIds, setChannelIds } = useSelectedChannels();
  const { markDone } = useOnboardingDone();
  const [draft, setDraft] = useState<string[]>(channelIds);

  const allIds = offices.flatMap((o) => o.members.map((m) => m.channelId));

  const save = () => {
    setChannelIds(draft);
    markDone();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 rounded-t-2xl bg-white p-5 sm:rounded-2xl dark:bg-zinc-900">
        <h2 id="onboarding-title" className="text-lg font-bold">
          {editing ? "事務所を変更" : "ようこそ！"}
        </h2>
        <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
          {"気になる事務所を選んでください\nいつでも変更できます"}
        </p>
        <button
          type="button"
          onClick={() => setDraft(allIds)}
          className="self-start rounded border border-blue-600 px-3 py-1 text-sm text-blue-600"
        >
          すべて選択
        </button>
        <OfficeSelector
          offices={offices}
          selected={draft}
          onChange={setDraft}
        />
        <div className="flex justify-end gap-2 pt-2">
          {editing && (
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm"
            >
              キャンセル
            </button>
          )}
          <button
            type="button"
            onClick={save}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            {editing ? "保存" : "はじめる"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SideMenu({
  offices,
  onClose,
  onEdit,
}: {
  offices: OfficeSummary[];
  onClose: () => void;
  onEdit: () => void;
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
            ✕
          </button>
        </div>
        <OfficeSelector
          offices={offices}
          selected={channelIds}
          onChange={setChannelIds}
        />
        <button
          type="button"
          onClick={onEdit}
          className="rounded border border-zinc-300 py-2 text-sm dark:border-zinc-700"
        >
          事務所を変更
        </button>
      </aside>
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
  const { done } = useOnboardingDone();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  // 事務所データが取れないときはオンボーディングを出さない（進めなくなるため）
  const showOnboarding = offices.length > 0 && (!done || editing);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
        <Link href="/" className="font-bold">
          Vちゃんねる
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/favorites" aria-label="お気に入り" className="px-2">
            ★
          </Link>
          <Link href="/settings" aria-label="設定" className="px-2">
            ⚙
          </Link>
          <Link href="/events" aria-label="イベントカレンダー" className="px-2">
            📅
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            disabled={offices.length === 0}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-700"
          >
            フィルター
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col pb-14">{children}</div>
      <YouTubePlayer />
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
      {menuOpen && (
        <SideMenu
          offices={offices}
          onClose={() => setMenuOpen(false)}
          onEdit={() => {
            setMenuOpen(false);
            setEditing(true);
          }}
        />
      )}
      {showOnboarding && (
        <OnboardingDialog
          offices={offices}
          editing={editing}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
