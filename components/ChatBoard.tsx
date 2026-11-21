"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Reply, Sparkles, Star } from "lucide-react";
import { useSelectedChannels } from "@/hooks/useSelection";
import {
  DEFAULT_AUTHOR,
  MAX_AUTHOR,
  MAX_CONTENT,
  groupPostsByParent,
  type ChatPost,
  type ChatPostGroup,
  type ChatThread,
} from "@/lib/chat";
import type { OfficeSummary } from "@/lib/offices";
import { CONTACT_EMAIL } from "@/lib/site";

const POLL_MS = 15_000;
const SEEN_COUNTS_KEY = "chat:last-seen-post-count";

const NG_MESSAGE = "不適切な表現が含まれているため投稿できません";
const HIDDEN_TEXT = "この投稿は表示されません";

/**
 * NG ワード（誹謗中傷・差別・性的表現）。
 * 判定は NFKC 正規化・小文字化・空白除去のうえ、部分一致で行う。
 * 本来は lib/ngWords.ts に置く想定の初期リスト。
 */
const NG_WORDS: readonly string[] = [
  // 誹謗中傷
  "死ね",
  "氏ね",
  "タヒね",
  "殺すぞ",
  "殺してやる",
  "ころすぞ",
  "消えろ",
  "ブス",
  // 差別
  "キチガイ",
  "きちがい",
  "ガイジ",
  "池沼",
  "チョン",
  "支那",
  "シナ人",
  // 性的表現
  "ちんこ",
  "チンコ",
  "ちんぽ",
  "チンポ",
  "まんこ",
  "マンコ",
  "セックス",
  "レイプ",
  "強姦",
  "オナニー",
  "中出し",
  "アナル",
];

/** 電話番号・メールアドレス・URL */
const NG_PATTERNS: readonly RegExp[] = [
  /0\d{1,4}[-\s]\d{1,4}[-\s]\d{3,4}/,
  /0[789]0\d{8}/,
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /https?:\/\//i,
  /www\./i,
];

function containsNgWord(text: string): boolean {
  if (!text) return false;
  const normalized = text.normalize("NFKC").toLowerCase();
  if (NG_PATTERNS.some((re) => re.test(normalized))) return true;
  const squashed = normalized.replace(/[\s\u200b-\u200d\ufeff]+/g, "");
  return NG_WORDS.some((w) => squashed.includes(w.normalize("NFKC").toLowerCase()));
}

function isHiddenPost(post: { content: string; author?: string | null }): boolean {
  return containsNgWord(post.content) || containsNgWord(post.author ?? "");
}

function reportHref(threadName: string, postNo: number): string {
  const subject = `掲示板の投稿の通報（${threadName} No.${postNo}）`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

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

function groupMaxPostNo(g: ChatPostGroup): number {
  return g.replies.reduce((m, r) => Math.max(m, r.postNo), g.parent.postNo);
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

function RulesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-3 text-sm shadow-sm dark:border-violet-900/50 dark:from-zinc-900 dark:to-violet-950/30">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">📢 掲示板の注意事項</h2>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="rounded-full border border-violet-300 bg-white px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950/20"
        >
          {open ? "折りたたむ" : "詳しく見る"}
        </button>
      </div>
      {open && (
        <ul className="mt-3 list-disc space-y-1 pl-5">
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
      )}
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
    if (containsNgWord(content) || containsNgWord(author)) {
      setError(NG_MESSAGE);
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
        <p className="text-xs text-zinc-500">
          誹謗中傷・個人情報の書き込みは禁止です
        </p>
        <div className="flex justify-end gap-2">
          <p className="mr-auto self-center text-xs text-zinc-500">
            投稿前に
            <Link href="/terms" className="ml-1 text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
              利用規約
            </Link>
            をお読みください
          </p>
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
  threadName,
  isNew,
  refs,
  onReply,
  onJumpToPost,
  variant = "parent",
}: {
  post: ChatPost;
  threadName: string;
  isNew: boolean;
  refs: ChatPost[];
  onReply: (postNo: number) => void;
  onJumpToPost: (postNo: number) => void;
  variant?: "parent" | "reply";
}) {
  const compact = variant === "reply";
  const hidden = isHiddenPost(post);

  return (
    <li
      id={`post-${post.postNo}`}
      className={`rounded-2xl border bg-white/90 p-3 shadow-sm transition-colors dark:bg-zinc-900/80 ${
        compact
          ? "border-violet-100 dark:border-violet-900/40"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>No.{post.postNo}</span>
        <span className="font-bold text-zinc-800 dark:text-zinc-200">
          {hidden ? DEFAULT_AUTHOR : post.author || DEFAULT_AUTHOR}
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
        <span className="ml-auto flex items-center gap-3">
          <a
            href={reportHref(threadName, post.postNo)}
            className="text-zinc-500 underline hover:text-red-600"
          >
            通報
          </a>
          <button
            type="button"
            onClick={() => onReply(post.postNo)}
            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
          >
            <Reply size={14} aria-hidden />
            返信
          </button>
        </span>
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
              ↪ No.{r.postNo}{" "}
              {isHiddenPost(r)
                ? HIDDEN_TEXT
                : `${r.author || DEFAULT_AUTHOR}: ${shortText(r.content)}`}
            </button>
          ))}
        </div>
      )}

      {hidden ? (
        <p className="text-sm italic text-zinc-500">{HIDDEN_TEXT}</p>
      ) : (
        <Body text={post.content} onJumpToPost={onJumpToPost} />
      )}
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
  const [expandedParents, setExpandedParents] = useState<Set<number>>(
    () => new Set(),
  );
  const listRef = useRef<HTMLUListElement | null>(null);

  const byPostNo = useMemo(
    () => new Map((posts ?? []).map((p) => [p.postNo, p])),
    [posts],
  );
  // 親コメントのまとまりを、まとまり内の最大 postNo の降順（新しい順）に並べる。
  // まとまりの中の返信は従来どおり古い順。
  const groups = useMemo<ChatPostGroup[]>(
    () =>
      [...groupPostsByParent(posts ?? [])].sort(
        (a, b) => groupMaxPostNo(b) - groupMaxPostNo(a),
      ),
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

  const handlePosted = useCallback(() => {
    load();
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [load]);

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
      <ul ref={listRef} className="scroll-mt-24 space-y-4 pb-24">
        {groups.map((g) => {
          const parent = g.parent;
          const parentRefs = parseReplyNos(parent.content)
            .map((no) => byPostNo.get(no))
            .flatMap((row) => (row ? [row] : []));
          const expanded = expandedParents.has(parent.postNo);
          const foldable = g.replies.length > 2;
          const visibleReplies =
            foldable && !expanded ? g.replies.slice(0, 2) : g.replies;

          return (
            <li key={parent.id} className="space-y-2">
              <PostItem
                post={parent}
                threadName={thread.name}
                isNew={baselinePostNo !== null && parent.postNo > baselinePostNo}
                refs={parentRefs}
                onReply={(postNo) => setSheet(`>>${postNo} `)}
                onJumpToPost={jumpToPost}
              />
              {g.replies.length > 0 && (
                <div className="ml-4 rounded-r-2xl border-l-2 border-violet-200 bg-violet-50/50 pl-3 dark:border-violet-900/50 dark:bg-violet-950/10">
                  <div className="space-y-2 py-2">
                    {visibleReplies.map((reply) => {
                      const refs = parseReplyNos(reply.content)
                        .map((no) => byPostNo.get(no))
                        .flatMap((row) => (row ? [row] : []));
                      return (
                        <PostItem
                          key={reply.id}
                          post={reply}
                          threadName={thread.name}
                          variant="reply"
                          isNew={
                            baselinePostNo !== null &&
                            reply.postNo > baselinePostNo
                          }
                          refs={refs}
                          onReply={(postNo) => setSheet(`>>${postNo} `)}
                          onJumpToPost={jumpToPost}
                        />
                      );
                    })}
                    {foldable && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedParents((prev) => {
                            const next = new Set(prev);
                            if (next.has(parent.postNo)) next.delete(parent.postNo);
                            else next.add(parent.postNo);
                            return next;
                          })
                        }
                        className="rounded-full border border-violet-300 bg-white px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950/20"
                      >
                        {expanded
                          ? "返信を折りたたむ"
                          : `返信をさらに表示（+${
                              g.replies.length - visibleReplies.length
                            }件）`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
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
          onPosted={handlePosted}
        />
      )}
    </div>
  );
}

export function ChatBoard({ offices }: { offices: OfficeSummary[] }) {
  const { channelIds } = useSelectedChannels();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState("");
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

  // 常に全スレッドを出す。選択中チャンネルを含む事務所のスレッド（offices 順）を先頭にし、
  // 残りは更新が新しい順。選択が空なら全件を更新が新しい順に並べる。
  // そのうえで postCount === 0 のスレッドは（非表示にせず）並びの最後にまとめる。
  const { tabs, starredIds } = useMemo(() => {
    if (!threads) {
      return { tabs: [] as ChatThread[], starredIds: new Set<string>() };
    }
    const byLastUpdated = (a: ChatThread, b: ChatThread) =>
      (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? "");

    const picked: ChatThread[] = [];
    const pickedIds = new Set<string>();
    if (channelIds.length > 0) {
      const selected = new Set(channelIds);
      const byName = new Map(threads.map((t) => [t.name.toLowerCase(), t]));
      for (const o of offices) {
        if (!o.members.some((m) => selected.has(m.channelId))) continue;
        const t = byName.get(o.name.toLowerCase());
        if (!t || pickedIds.has(t.id)) continue;
        pickedIds.add(t.id);
        picked.push(t);
      }
    }
    const rest = threads.filter((t) => !pickedIds.has(t.id)).sort(byLastUpdated);
    const ordered = [...picked, ...rest];
    const withPosts = ordered.filter((t) => t.postCount !== 0);
    const empty = ordered.filter((t) => t.postCount === 0);
    return { tabs: [...withPosts, ...empty], starredIds: pickedIds };
  }, [threads, offices, channelIds]);

  const current = tabs.find((t) => t.id === tab) ?? null;
  const activeThread = current ?? tabs[0] ?? null;

  useEffect(() => {
    if (!tabs.length) return;
    const hasSelected = tabs.some((t) => t.id === tab);
    if (!hasSelected) setTab(tabs[0].id);
  }, [tab, tabs]);

  return (
    <div className="space-y-4">
      <RulesPanel />
      <div className="-mx-4 px-4">
        <p className="mb-2 text-xs font-medium text-zinc-500">スレッド一覧</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => {
            const unread = Math.max(t.postCount - (seenCounts[t.id] ?? 0), 0);
            const starred = starredIds.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  markSeen(t.id, t.postCount);
                }}
                aria-pressed={tab === t.id}
                className={`relative min-w-28 shrink-0 rounded-2xl border px-3 py-1.5 text-left shadow-sm ${
                  tab === t.id
                    ? "border-violet-500 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                }`}
              >
                <p className="flex items-center gap-1 text-sm font-semibold">
                  {starred && (
                    <Star
                      size={12}
                      fill="currentColor"
                      aria-label="選択中の事務所"
                      className={`shrink-0 ${
                        tab === t.id ? "text-amber-200" : "text-amber-500"
                      }`}
                    />
                  )}
                  <span className="truncate">{t.name}</span>
                </p>
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
      {!threads && !failed && (
        <p className="text-sm text-zinc-500">読み込み中…</p>
      )}
      {threads?.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          スレッドがありません
        </p>
      )}
      {activeThread && (
        <ThreadView
          key={activeThread.id}
          thread={activeThread}
          onSeen={(postNo) => markSeen(activeThread.id, postNo)}
        />
      )}
    </div>
  );
}
