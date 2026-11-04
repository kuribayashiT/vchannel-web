"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelectedChannels } from "@/hooks/useSelection";
import {
  DEFAULT_AUTHOR,
  MAX_AUTHOR,
  MAX_CONTENT,
  type ChatPost,
  type ChatThread,
} from "@/lib/chat";
import type { OfficeSummary } from "@/lib/offices";

const RULES = "rules";
const POLL_MS = 15_000;

const fmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Body({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|>>\d{1,6})/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-blue-600 underline"
          >
            {p}
          </a>
        ) : /^>>\d/.test(p) ? (
          <span key={i} className="text-blue-600">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </p>
  );
}

function Rules() {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <h2 className="font-bold">📢 掲示板ルール</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>VTuber・配信者・他のユーザーを誹謗中傷する投稿は禁止です。</li>
        <li>個人情報の書き込み・詮索、なりすましは禁止です。</li>
        <li>スパム・宣伝目的の連投、違法・不快なコンテンツは禁止です。</li>
        <li>
          ネタバレや過度な批判は避け、敬意を持って楽しく利用してください。
        </li>
        <li>
          不適切な投稿は予告なく削除する場合があります。投稿内容は自己責任でお願いします。
        </li>
      </ul>
    </div>
  );
}

function PostSheet({
  threadId,
  initial,
  onClose,
  onPosted,
}: {
  threadId: string;
  initial: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!content.trim()) {
      setError("投稿内容を入力してください");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, content, author }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "投稿に失敗しました");
        return;
      }
      onPosted();
      onClose();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="投稿する"
        className="mx-auto w-full max-w-3xl space-y-3 rounded-t-2xl bg-white p-4 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          value={author}
          maxLength={MAX_AUTHOR}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder={`名前（省略で「${DEFAULT_AUTHOR}」）`}
          className="w-full rounded border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700"
        />
        <textarea
          value={content}
          maxLength={MAX_CONTENT}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="投稿内容"
          className="w-full rounded border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700"
        />
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="text-red-600">{error}</span>
          <span>
            {content.length}/{MAX_CONTENT}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-zinc-600"
          >
            キャンセル
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "送信中…" : "投稿する"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThreadView({ thread }: { thread: ChatThread }) {
  const [posts, setPosts] = useState<ChatPost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/chat/posts?threadId=${thread.id}`, { cache: "no-store" })
      .then((r) =>
        r.ok ? (r.json() as Promise<ChatPost[]>) : Promise.reject(),
      )
      .then((p) => {
        setPosts(p);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [thread.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      {failed && (
        <p className="mb-2 text-sm text-red-600">読み込みに失敗しました</p>
      )}
      {posts === null && !failed && (
        <p className="text-sm text-zinc-500">読み込み中…</p>
      )}
      {posts?.length === 0 && (
        <div className="py-10 text-center text-sm text-zinc-500">
          <p>まだ投稿がありません</p>
          <p>右下のボタンから最初の投稿をしてみよう！</p>
        </div>
      )}
      <ul className="space-y-3 pb-24">
        {posts?.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="font-bold">{p.postNo}</span>
              <span className="text-zinc-800 dark:text-zinc-200">
                {p.author || DEFAULT_AUTHOR}
              </span>
              {p.isBot && (
                <span className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">
                  📰 Bot
                </span>
              )}
              {p.createdAt && <span>{fmt.format(new Date(p.createdAt))}</span>}
              <button
                onClick={() => setSheet(`>>${p.postNo} `)}
                className="ml-auto text-blue-600"
              >
                返信
              </button>
            </div>
            <Body text={p.content} />
          </li>
        ))}
      </ul>
      <button
        onClick={() => setSheet("")}
        className="fixed bottom-20 right-4 md:bottom-6 z-40 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg"
      >
        投稿する
      </button>
      {sheet !== null && (
        <PostSheet
          threadId={thread.id}
          initial={sheet}
          onClose={() => setSheet(null)}
          onPosted={load}
        />
      )}
    </div>
  );
}

export function ChatBoard({ offices }: { offices: OfficeSummary[] }) {
  const { channelIds } = useSelectedChannels();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState(RULES);

  useEffect(() => {
    fetch("/api/chat/threads")
      .then((r) =>
        r.ok ? (r.json() as Promise<ChatThread[]>) : Promise.reject(),
      )
      .then(setThreads)
      .catch(() => setFailed(true));
  }, []);

  // 選択事務所の順に並べる。未選択なら更新が新しい順で全スレッド
  const tabs = useMemo(() => {
    if (!threads) return [];
    const byName = new Map(threads.map((t) => [t.name.toLowerCase(), t]));
    const picked = offices
      .filter((o) => o.members.some((m) => channelIds.includes(m.channelId)))
      .flatMap((o) => {
        const t = byName.get(o.name.toLowerCase());
        return t ? [t] : [];
      });
    if (picked.length) return picked;
    return [...threads].sort((a, b) =>
      (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? ""),
    );
  }, [threads, offices, channelIds]);

  const current = tabs.find((t) => t.id === tab) ?? null;

  return (
    <div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {[{ id: RULES, name: "📢 掲示板ルール" }, ...tabs].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`shrink-0 rounded-full px-3 py-1 text-sm ${
              tab === t.id
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>
      {failed && (
        <p className="text-sm text-red-600">スレッドを読み込めませんでした</p>
      )}
      {!threads && !failed && tab !== RULES && (
        <p className="text-sm text-zinc-500">読み込み中…</p>
      )}
      {threads?.length === 0 && (
        <p className="py-10 text-center text-sm text-zinc-500">
          スレッドがありません
        </p>
      )}
      {tab === RULES ? (
        <Rules />
      ) : (
        current && <ThreadView key={current.id} thread={current} />
      )}
    </div>
  );
}
