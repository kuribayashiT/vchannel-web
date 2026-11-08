"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
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
const SEEN_COUNTS_KEY = "chat:last-seen-post-count";
const QUICK_REACTIONS = ["💖", "👏", "😂", "🔥"] as const;

const fmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function parseReplyNos(text: string): number[] {
  return [...text.matchAll(/>>(\d{1,6})/g)].map((m) => Number(m[1]));
}

function shortText(text: string, max = 70): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

function readSeenCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SEEN_COUNTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([k, v]) =>
        Number.isFinite(v) ? [[k, Number(v)]] : [],
      ),
    );
  } catch {
    return {};
  }
}

function writeSeenCounts(next: Record<string, number>) {
  localStorage.setItem(SEEN_COUNTS_KEY, JSON.stringify(next));
}

function Body({
  text,
  onJumpToPost,
}: {
  text: string;
  onJumpToPost: (postNo: number) => void;
}) {
  const parts = text.split(/(https?:\/\/[^\s]+|>>\d{1,6})/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
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
          <button
            key={i}
            type="button"
            onClick={() => onJumpToPost(Number(p.replace(">>", "")))}
            className="font-medium text-blue-600 underline underline-offset-2"
          >
            {p}
          </button>
        ) : (
          p
        ),
      )}
    </p>
  );
}

function Rules() {
  return (
    <div className="space-y-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-4 text-sm shadow-sm dark:border-violet-900/50 dark:from-zinc-900 dark:to-violet-950/30">
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
        <p className="text-sm font-bold text-violet-600 dark:text-violet-300">
          ひとこと投稿してみよう ✨
        </p>
        <input
          value={author}
          maxLength={MAX_AUTHOR}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder={`名前（省略で「${DEFAULT_AUTHOR}」）`}
          className="w-full rounded-xl border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700"
        />
        <textarea
          value={content}
          maxLength={MAX_CONTENT}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="投稿内容"
          className="w-full rounded-xl border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700"
        />
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="text-red-600">{error}</span>
          <span>
            {content.length}/{MAX_CONTENT}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-zinc-600"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "送信中…" : "投稿する"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PostItem({
  post,
  isNew,
  refs,
  onReply,
  onJumpToPost,
}: {
  post: ChatPost;
  isNew: boolean;
  refs: ChatPost[];
  onReply: (postNo: number) => void;
  onJumpToPost: (postNo: number) => void;
}) {
  const [pickedReaction, setPickedReaction] = useState<string | null>(null);

  return (
    <li
      id={`post-${post.postNo}`}
      className="rounded-2xl border border-zinc-200 bg-white/90 p-3 shadow-sm transition-colors dark:border-zinc-800 dark:bg-zinc-900/80"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span className="rounded-full bg-violet-100 px-2 py-0.5 font-bold text-violet-700 dark:bg-violet-900/50 dark:text-violet-200">
          No.{post.postNo}
        </span>
        <span className="font-bold text-zinc-800 dark:text-zinc-200">
          {post.author || DEFAULT_AUTHOR}
        </span>
        {isNew && (
          <span className="rounded-full bg-rose-500 px-2 py-0.5 font-bold text-white">
            NEW
          </span>
        )}
        {post.isBot && (
          <span className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">📰 Bot</span>
        )}
        {post.createdAt && <span>{fmt.format(new Date(post.createdAt))}</span>}
        <button
          type="button"
          onClick={() => onReply(post.postNo)}
          className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
        >
          返信
        </button>
      </div>

      {refs.length > 0 && (
        <div className="mb-2 space-y-1 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-800/60">
          {refs.slice(0, 2).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onJumpToPost(r.postNo)}
              className="block w-full truncate text-left text-zinc-600 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-300"
            >
              ↪ No.{r.postNo} {r.author || DEFAULT_AUTHOR}: {shortText(r.content)}
            </button>
          ))}
        </div>
      )}

      <Body text={post.content} onJumpToPost={onJumpToPost} />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => setPickedReaction((prev) => (prev === emoji ? null : emoji))}
            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
              pickedReaction === emoji
                ? "border-violet-400 bg-violet-100 text-violet-800 dark:border-violet-500 dark:bg-violet-900/40 dark:text-violet-200"
                : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </li>
  );
}

function ThreadView({
  thread,
  onSeen,
}: {
  thread: ChatThread;
  onSeen: (postNo: number) => void;
}) {
  const [posts, setPosts] = useState<ChatPost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const [baselinePostNo, setBaselinePostNo] = useState<number | null>(null);

  const byPostNo = useMemo(
    () => new Map((posts ?? []).map((p) => [p.postNo, p])),
    [posts],
  );

  const jumpToPost = useCallback((postNo: number) => {
    const el = document.getElementById(`post-${postNo}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-blue-400");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-blue-400");
    }, 1200);
  }, []);

  const load = useCallback(() => {
    fetch(`/api/chat/posts?threadId=${thread.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ChatPost[]>) : Promise.reject()))
      .then((p) => {
        const maxPostNo = p.reduce((m, row) => Math.max(m, row.postNo), 0);
        setPosts(p);
        setFailed(false);
        onSeen(maxPostNo);
        setBaselinePostNo((prev) => prev ?? maxPostNo);
      })
      .catch(() => setFailed(true));
  }, [onSeen, thread.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      {failed && <p className="mb-2 text-sm text-red-600">読み込みに失敗しました</p>}
      {posts === null && !failed && <p className="text-sm text-zinc-500">読み込み中…</p>}
      {posts?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50 py-10 text-center text-sm text-violet-700 dark:border-violet-800 dark:bg-violet-950/20 dark:text-violet-300">
          <p className="font-semibold">まだ投稿がありません</p>
          <p>いちばん最初のコメントをしてみよう！</p>
        </div>
      )}
      <ul className="space-y-3 pb-24">
        {posts?.map((p) => {
          const refs = parseReplyNos(p.content)
            .map((no) => byPostNo.get(no))
            .flatMap((row) => (row ? [row] : []));
          return (
            <PostItem
              key={p.id}
              post={p}
              isNew={baselinePostNo !== null && p.postNo > baselinePostNo}
              refs={refs}
              onReply={(postNo) => setSheet(`>>${postNo} `)}
              onJumpToPost={jumpToPost}
            />
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => setSheet("")}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-violet-500 to-blue-500 px-5 py-3 text-sm font-bold text-white shadow-lg hover:brightness-110 md:bottom-6"
      >
        <Sparkles size={16} aria-hidden />
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
  const [seenCounts, setSeenCounts] = useState<Record<string, number>>(() =>
    readSeenCounts(),
  );

  useEffect(() => {
    fetch("/api/chat/threads")
      .then((r) => (r.ok ? (r.json() as Promise<ChatThread[]>) : Promise.reject()))
      .then(setThreads)
      .catch(() => setFailed(true));
  }, []);

  const markSeen = useCallback((threadId: string, postNo: number) => {
    setSeenCounts((prev) => {
      if ((prev[threadId] ?? 0) >= postNo) return prev;
      const next = { ...prev, [threadId]: postNo };
      writeSeenCounts(next);
      return next;
    });
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
    <div className="space-y-4">
      <div className="-mx-4 px-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-zinc-500">スレッド一覧</p>
          {current && (
            <p className="text-xs text-zinc-500">
              投稿 {current.postCount.toLocaleString()} 件
            </p>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setTab(RULES)}
            aria-pressed={tab === RULES}
            className={`shrink-0 rounded-2xl border px-3 py-2 text-sm font-medium ${
              tab === RULES
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            }`}
          >
            📢 掲示板ルール
          </button>
          {tabs.map((t) => {
            const unread = Math.max(t.postCount - (seenCounts[t.id] ?? 0), 0);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  markSeen(t.id, t.postCount);
                }}
                aria-pressed={tab === t.id}
                className={`relative min-w-44 shrink-0 rounded-2xl border px-3 py-2 text-left shadow-sm ${
                  tab === t.id
                    ? "border-violet-500 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                }`}
              >
                <p className="truncate text-sm font-semibold">{t.name}</p>
                <p
                  className={`text-xs ${
                    tab === t.id ? "text-white/90" : "text-zinc-500"
                  }`}
                >
                  {t.postCount.toLocaleString()} 件
                </p>
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">
                    +{unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {failed && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20">
          スレッドを読み込めませんでした
        </p>
      )}
      {!threads && !failed && tab !== RULES && (
        <p className="text-sm text-zinc-500">読み込み中…</p>
      )}
      {threads?.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          スレッドがありません
        </p>
      )}
      {tab === RULES ? (
        <Rules />
      ) : (
        current && (
          <ThreadView
            key={current.id}
            thread={current}
            onSeen={(postNo) => markSeen(current.id, postNo)}
          />
        )
      )}
    </div>
  );
}
