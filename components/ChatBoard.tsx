"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  MessageCirclePlus,
  Pencil,
  Reply,
  SendHorizontal,
  Sparkles,
  Star,
} from "lucide-react";
import { useSelectedChannels } from "@/hooks/useSelection";
import {
  AUTHOR_STORAGE_KEY,
  DEFAULT_AUTHOR,
  MAX_AUTHOR,
  MAX_CONTENT,
  groupPostsByParent,
  type ChatPost,
  type ChatPostGroup,
  type ChatPostPage,
  type ChatThread,
} from "@/lib/chat";
import type { OfficeSummary } from "@/lib/offices";
import { CONTACT_EMAIL } from "@/lib/site";

const POLL_MS = 15_000;
const SEEN_COUNTS_KEY = "chat:last-seen-post-count";
const MAX_DRAFT = 100;

const NG_MESSAGE = "不適切な表現が含まれているため投稿できません";
const HIDDEN_TEXT = "この投稿は表示されません";

/**
 * 日替わりのお題（本来は lib/chat.ts に置く想定。10 個）。
 */
const CHAT_TOPICS: readonly string[] = [
  "最近いちばん笑った配信は？",
  "推しを知ったきっかけ",
  "今週の配信でよかったところ",
  "初見さんにおすすめの切り抜き・アーカイブ",
  "最近ハマってる歌ってみた・オリ曲",
  "コラボしてほしい組み合わせ",
  "記念配信の思い出",
  "今やってるゲーム配信の感想",
  "推しの好きなところをひとつ",
  "今日の配信、何見る？",
];

const TOPIC_STEPS = [1, 3, 7, 9] as const; // 10 と互いに素な歩幅

/**
 * JST の日付文字列（yyyy-MM-dd）から決まる順番でお題を選ぶ。
 * 同じ日なら全員同じ。Math.random は使わない（hydration のずれ防止）。
 */
function pickTopics(dateKey: string, count = 3): string[] {
  const seed = Number(dateKey.replace(/\D/g, "")) || 0;
  const n = CHAT_TOPICS.length;
  const start = seed % n;
  const step = TOPIC_STEPS[Math.floor(seed / n) % TOPIC_STEPS.length];
  const total = Math.min(count, n);
  return Array.from({ length: total }, (_, i) => CHAT_TOPICS[(start + i * step) % n]);
}

const jstDateFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" });
const subscribeNoop = () => () => {};

/** マウント後にだけ JST の日付キーを返す（サーバー側・マウント前は空文字） */
function useJstDateKey(): string {
  return useSyncExternalStore(
    subscribeNoop,
    () => jstDateFmt.format(new Date()),
    () => "",
  );
}

/**
 * `draft` クエリを 1 行入力欄の初期値にする。
 * 前後の空白を取り 100 字で切り詰める。空なら null（入れない）。
 * 元の値が空白で終わっていた場合は、続きを書き始めやすいよう末尾に半角スペースを 1 つ戻す。
 */
function parseDraft(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const text = trimmed.slice(0, MAX_DRAFT);
  return /\s$/.test(raw) && text.length < MAX_DRAFT ? `${text} ` : text;
}

/** 最後に使った名前を読む（失敗・未保存なら空文字） */
function readAuthor(): string {
  if (typeof window === "undefined") return "";
  try {
    const v = localStorage.getItem(AUTHOR_STORAGE_KEY);
    return v ? v.slice(0, MAX_AUTHOR) : "";
  } catch {
    return "";
  }
}

/** 最後に使った名前を保存する（空なら消す） */
function writeAuthor(name: string) {
  try {
    const t = name.trim();
    if (t) localStorage.setItem(AUTHOR_STORAGE_KEY, t);
    else localStorage.removeItem(AUTHOR_STORAGE_KEY);
  } catch {
    // 保存できなくても投稿は続行する
  }
}

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

/**
 * 投稿の共通処理（空チェック・NG ワード判定・API 呼び出し）。
 * 成功なら null、失敗ならエラー文言を返す。投稿シートと QuickComposer で共用する。
 */
async function submitPost(
  threadId: string,
  content: string,
  author: string,
): Promise<string | null> {
  if (!content.trim()) return "投稿内容を入力してください";
  if (containsNgWord(content) || containsNgWord(author)) return NG_MESSAGE;
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
      return j?.error ?? "投稿に失敗しました";
    }
    return null;
  } catch {
    return "通信に失敗しました";
  }
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

/** 既存の投稿に取得分を足し、id で重複を除いて postNo 昇順に並べる */
function mergePosts(prev: ChatPost[], incoming: ChatPost[]): ChatPost[] {
  const map = new Map<string, ChatPost>();
  for (const p of prev) map.set(p.id, p);
  for (const p of incoming) map.set(p.id, p);
  return [...map.values()].sort((a, b) => a.postNo - b.postNo);
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

/** お題チップの列。マウント前（topics が空）は 1 行分の高さだけ確保する */
function TopicChips({
  topics,
  onPick,
}: {
  topics: string[];
  onPick: (topic: string) => void;
}) {
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-2">
      {topics.map((topic) => (
        <button
          key={topic}
          type="button"
          onClick={() => onPick(topic)}
          className="inline-flex items-center gap-1 rounded-full border border-violet-200 px-3 py-1 text-left text-xs text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/20"
        >
          <MessageCirclePlus size={12} aria-hidden className="shrink-0" />
          <span>{topic}</span>
        </button>
      ))}
    </div>
  );
}

/** スレッド先頭の 1 行入力欄。シートを開かずに書ける */
function QuickComposer({
  thread,
  value,
  onChange,
  author,
  onAuthorChange,
  inputRef,
  wrapperRef,
  onPosted,
  onOpenSheet,
}: {
  thread: ChatThread;
  value: string;
  onChange: (next: string) => void;
  author: string;
  onAuthorChange: (next: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
  /** 投稿成功時。使った名前を渡す */
  onPosted: (author: string) => void;
  onOpenSheet: (content: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const displayName = author.trim() || DEFAULT_AUTHOR;
  const canSend = value.trim().length > 0 && !busy;

  const send = useCallback(async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    const err = await submitPost(thread.id, value, author);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onChange("");
    onPosted(author);
  }, [author, busy, onChange, onPosted, thread.id, value]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    // 日本語変換の確定 Enter では送信しない（Safari は keyCode 229 も見る）
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    void send();
  }

  return (
    <div ref={wrapperRef} className="mb-3 scroll-mt-24 space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={MAX_CONTENT}
          disabled={busy}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          enterKeyHint="send"
          aria-label="ひとことで投稿"
          placeholder={`${thread.name}の話ならなんでもOK（ひとことでも）`}
          className="min-w-0 flex-1 text-ellipsis rounded-full border border-zinc-300 bg-transparent px-4 py-2.5 text-base disabled:opacity-60 md:text-sm dark:border-zinc-700"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          aria-label="送信"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm hover:brightness-110 disabled:opacity-50"
        >
          <SendHorizontal size={18} aria-hidden />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
        {editingName ? (
          <input
            autoFocus
            value={author}
            maxLength={MAX_AUTHOR}
            disabled={busy}
            onChange={(e) => onAuthorChange(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              setEditingName(false);
            }}
            aria-label="名前"
            placeholder={`名前（省略で「${DEFAULT_AUTHOR}」）`}
            className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-transparent px-3 py-1 text-base md:text-sm dark:border-zinc-700"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="inline-flex min-w-0 items-center gap-1 hover:text-violet-600 dark:hover:text-violet-300"
          >
            <span className="truncate">名前: {displayName}</span>
            <Pencil size={12} aria-hidden className="shrink-0" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenSheet(value)}
          className="shrink-0 whitespace-nowrap text-violet-600 hover:underline dark:text-violet-300"
        >
          長文で書く
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function PostSheet({
  threadId,
  initial,
  initialAuthor,
  onClose,
  onPosted,
}: {
  threadId: string;
  initial: string;
  initialAuthor: string;
  onClose: () => void;
  /** 投稿成功時。使った名前を渡す */
  onPosted: (author: string) => void;
}) {
  const [author, setAuthor] = useState(initialAuthor);
  const [content, setContent] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    const err = await submitPost(threadId, content, author);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onPosted(author);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="投稿する"
        className="mx-auto max-h-[100dvh] w-full max-w-3xl space-y-3 overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-zinc-900"
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
          className="w-full min-w-0 rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-base md:text-sm dark:border-zinc-700"
        />
        <textarea
          value={content}
          maxLength={MAX_CONTENT}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="投稿内容"
          className="w-full min-w-0 rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-base md:text-sm dark:border-zinc-700"
        />
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="text-red-600">{error}</span>
          <span>
            {content.length}/{MAX_CONTENT}
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          誹謗中傷・個人情報の書き込みは禁止です。投稿前に
          <Link
            href="/terms"
            className="ml-1 text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
          >
            利用規約
          </Link>
          をお読みください。
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-zinc-300 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="min-h-11 shrink-0 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
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

type SheetState = { initial: string; fromQuick: boolean };

function ThreadView({
  thread,
  onSeen,
  initialDraft,
  onDraftApplied,
}: {
  thread: ChatThread;
  onSeen: (postNo: number) => void;
  /** ディープリンクの draft。マウント時だけ 1 行入力欄の初期値として使う（自動送信しない） */
  initialDraft: string | null;
  /** 初期値を入れた時点で呼ぶ（クエリを消す） */
  onDraftApplied: () => void;
}) {
  const [posts, setPosts] = useState<ChatPost[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [quick, setQuick] = useState(initialDraft ?? "");
  const [author, setAuthor] = useState(() => readAuthor());
  const [baselinePostNo, setBaselinePostNo] = useState<number | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<number>>(
    () => new Set(),
  );
  const listRef = useRef<HTMLUListElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const quickInputRef = useRef<HTMLInputElement | null>(null);
  /** 表示中の投稿の最新値（差分取得の before / after 計算用） */
  const postsRef = useRef<ChatPost[] | null>(null);
  const loadingMoreRef = useRef(false);
  const onSeenRef = useRef(onSeen);
  const dateKey = useJstDateKey();
  const topics = useMemo(
    () => (dateKey ? pickTopics(dateKey, 3) : []),
    [dateKey],
  );

  useEffect(() => {
    onSeenRef.current = onSeen;
  }, [onSeen]);

  // 初期値を入れた時点でクエリを消す
  useEffect(() => {
    if (initialDraft !== null) onDraftApplied();
  }, [initialDraft, onDraftApplied]);

  /** QuickComposer までスクロールしてフォーカスする。text があれば入力欄に入れる */
  const focusComposer = useCallback((text?: string) => {
    if (text !== undefined) setQuick(text);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.requestAnimationFrame(() => {
      const el = quickInputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // 選択位置を設定できなくても問題ない
      }
    });
  }, []);

  const openTopic = useCallback(
    (topic: string) => {
      focusComposer(`【お題】${topic} `);
    },
    [focusComposer],
  );
  const closeSheet = useCallback(() => {
    setSheet(null);
  }, []);

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

  // まだ読み込んでいない古い投稿への飛び先は、要素が無いので何もしない
  const jumpToPost = useCallback((postNo: number) => {
    const el = document.getElementById(`post-${postNo}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-blue-400");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-blue-400");
    }, 1200);
  }, []);

  /** 取得した投稿を表示中の一覧にマージし、表示中の最大 postNo を返す */
  const applyPage = useCallback((incoming: ChatPost[]): number => {
    const merged = mergePosts(postsRef.current ?? [], incoming);
    postsRef.current = merged;
    setPosts(merged);
    return merged.reduce((m, p) => Math.max(m, p.postNo), 0);
  }, []);

  /** 新着の取得。表示中の最大 postNo より新しい分だけ（0 件のときは最新 50 件） */
  const fetchNew = useCallback(async () => {
    const current = postsRef.current;
    const maxPostNo = current
      ? current.reduce((m, p) => Math.max(m, p.postNo), 0)
      : 0;
    const params = new URLSearchParams({ threadId: thread.id });
    const useAfter = maxPostNo > 0;
    if (useAfter) params.set("after", String(maxPostNo));
    try {
      const res = await fetch(`/api/chat/posts?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("fetch failed");
      const page = (await res.json()) as ChatPostPage;
      const newMax = applyPage(page.posts);
      if (!useAfter) setHasMore(page.hasMore);
      setFailed(false);
      onSeenRef.current(newMax);
      setBaselinePostNo((prev) => prev ?? newMax);
    } catch {
      setFailed(true);
    }
  }, [applyPage, thread.id]);

  /** さらに古い投稿の取得。表示中の最小 postNo より前 */
  const loadOlder = useCallback(async () => {
    const current = postsRef.current;
    if (!current || current.length === 0 || loadingMoreRef.current) return;
    const minPostNo = current.reduce(
      (m, p) => Math.min(m, p.postNo),
      Number.POSITIVE_INFINITY,
    );
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const params = new URLSearchParams({
        threadId: thread.id,
        before: String(minPostNo),
      });
      const res = await fetch(`/api/chat/posts?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("fetch failed");
      const page = (await res.json()) as ChatPostPage;
      applyPage(page.posts);
      setHasMore(page.hasMore);
    } catch {
      setLoadMoreFailed(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [applyPage, thread.id]);

  /** 投稿成功後の共通処理: 名前を覚える → 新着の差分取得 → リスト先頭へスクロール */
  const afterPost = useCallback(
    (usedAuthor: string) => {
      writeAuthor(usedAuthor);
      setAuthor(usedAuthor.trim());
      void fetchNew().then(() => {
        listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [fetchNew],
  );

  const handleSheetPosted = useCallback(
    (usedAuthor: string) => {
      if (sheet?.fromQuick) setQuick("");
      afterPost(usedAuthor);
    },
    [afterPost, sheet],
  );

  // 初回取得と 15 秒ごとの新着ポーリング。タブが非表示の間は止め、戻ったらすぐ 1 回取得する
  useEffect(() => {
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
    const start = () => {
      if (timer === undefined) {
        timer = window.setInterval(() => void fetchNew(), POLL_MS);
      }
    };
    void fetchNew();
    if (document.visibilityState !== "hidden") start();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        stop();
        void fetchNew();
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [fetchNew]);

  return (
    <div>
      <QuickComposer
        thread={thread}
        value={quick}
        onChange={setQuick}
        author={author}
        onAuthorChange={setAuthor}
        inputRef={quickInputRef}
        wrapperRef={composerRef}
        onPosted={afterPost}
        onOpenSheet={(content) => setSheet({ initial: content, fromQuick: true })}
      />
      <div className="mb-3 space-y-1.5">
        <p className="text-xs text-zinc-500">話題をえらんで書く</p>
        <TopicChips topics={topics} onPick={openTopic} />
      </div>
      {failed && <p className="mb-2 text-sm text-red-600">読み込みに失敗しました</p>}
      {posts === null && !failed && <p className="text-sm text-zinc-500">読み込み中…</p>}
      {posts?.length === 0 && (
        <div className="space-y-3 rounded-2xl border border-dashed border-violet-300 bg-violet-50 px-4 py-8 text-center text-sm text-violet-700 dark:border-violet-800 dark:bg-violet-950/20 dark:text-violet-300">
          <div>
            <p className="font-semibold">まだ投稿がありません</p>
            <p>お題をえらんで、最初のひとことを書いてみよう</p>
          </div>
          <div className="flex justify-center">
            <TopicChips topics={topics} onPick={openTopic} />
          </div>
        </div>
      )}
      <ul ref={listRef} className="scroll-mt-24 space-y-4">
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
                onReply={(postNo) =>
                  setSheet({ initial: `>>${postNo} `, fromQuick: false })
                }
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
                          onReply={(postNo) =>
                            setSheet({
                              initial: `>>${postNo} `,
                              fromQuick: false,
                            })
                          }
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
      <div className="pb-24 pt-4">
        {hasMore && (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingMore}
              className="rounded-full border border-violet-300 bg-white px-5 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-60 dark:border-violet-700 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950/20"
            >
              {loadingMore ? "読み込み中…" : "さらに古い投稿を読み込む"}
            </button>
            {loadMoreFailed && (
              <p role="alert" className="text-xs text-red-600">
                読み込みに失敗しました
              </p>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => focusComposer()}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-violet-500 to-blue-500 px-5 py-3 text-sm font-bold text-white shadow-lg hover:brightness-110 md:bottom-6"
      >
        <Sparkles size={16} aria-hidden />
        投稿する
      </button>
      {sheet !== null && (
        <PostSheet
          threadId={thread.id}
          initial={sheet.initial}
          initialAuthor={author}
          onClose={closeSheet}
          onPosted={handleSheetPosted}
        />
      )}
    </div>
  );
}

export function ChatBoard({ offices }: { offices: OfficeSummary[] }) {
  const { channelIds } = useSelectedChannels();
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelParam = searchParams.get("channel") ?? "";
  const hasDeepLinkQuery = searchParams.has("channel") || searchParams.has("draft");

  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState("");
  const [seenCounts, setSeenCounts] = useState<Record<string, number>>(() =>
    readSeenCounts(),
  );
  // 1 行入力欄の初期値。最初のマウント時のクエリから 1 回だけ決める。
  const [pendingDraft, setPendingDraft] = useState<string | null>(() =>
    parseDraft(searchParams.get("draft")),
  );
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const scrollPendingRef = useRef(channelParam !== "");

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

  // ディープリンク: channel の所属事務所と同名（小文字比較）のスレッド。見つからなければ null。
  const deepLinkThreadId = useMemo(() => {
    if (!channelParam || !threads) return null;
    const office = offices.find((o) =>
      o.members.some((m) => m.channelId === channelParam),
    );
    if (!office) return null;
    const name = office.name.toLowerCase();
    return threads.find((t) => t.name.toLowerCase() === name)?.id ?? null;
  }, [channelParam, offices, threads]);

  // 初期タブ（tab が空の間）はディープリンクのスレッドを優先する
  const current = tabs.find((t) => t.id === (tab || deepLinkThreadId)) ?? null;
  const activeThread = current ?? tabs[0] ?? null;

  useEffect(() => {
    if (!tabs.length) return;
    if (tab === "") {
      setTab(deepLinkThreadId ?? tabs[0].id);
      return;
    }
    if (!tabs.some((t) => t.id === tab)) setTab(tabs[0].id);
  }, [tab, tabs, deepLinkThreadId]);

  // 選んだタブが見えるよう、横スクロールで中央へ（ディープリンクで開いたときの 1 回だけ）
  useEffect(() => {
    if (!scrollPendingRef.current || !tab) return;
    const el = tabRefs.current.get(tab);
    if (!el) return;
    scrollPendingRef.current = false;
    el.scrollIntoView({ inline: "center", block: "nearest" });
  }, [tab, tabs]);

  // draft を入力欄の初期値に入れた時点でクエリを消す（再読込で再び入らないように）
  const handleDraftApplied = useCallback(() => {
    setPendingDraft(null);
    if (hasDeepLinkQuery) router.replace("/chat", { scroll: false });
  }, [hasDeepLinkQuery, router]);

  return (
    <div className="space-y-4">
      <RulesPanel />
      <div className="-mx-4 px-4">
        <p className="mb-2 text-xs font-medium text-zinc-500">スレッド一覧</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => {
            const unread = Math.max(t.postCount - (seenCounts[t.id] ?? 0), 0);
            const starred = starredIds.has(t.id);
            const selected = activeThread?.id === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(t.id, el);
                  else tabRefs.current.delete(t.id);
                }}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  markSeen(t.id, t.postCount);
                }}
                aria-pressed={selected}
                className={`relative min-w-28 shrink-0 rounded-2xl border px-3 py-1.5 text-left shadow-sm ${
                  selected
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
                        selected ? "text-amber-200" : "text-amber-500"
                      }`}
                    />
                  )}
                  <span className="truncate">{t.name}</span>
                </p>
                <p
                  className={`text-xs ${
                    selected ? "text-white/90" : "text-zinc-500"
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
          initialDraft={pendingDraft}
          onDraftApplied={handleDraftApplied}
        />
      )}
    </div>
  );
}
