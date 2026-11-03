export interface ChatThread {
  id: string;
  name: string;
  office: string;
  postCount: number;
  lastUpdated: string | null;
}

export interface ChatPost {
  id: string;
  threadId: string;
  author: string;
  content: string;
  postNo: number;
  parentNo: number;
  isBot: boolean;
  createdAt: string | null;
}

export const MAX_CONTENT = 500;
export const MAX_AUTHOR = 20;
export const DEFAULT_AUTHOR = "名無しさん";

/** `>>N` アンカーの最小値（なければ 0） */
export function extractParentNo(content: string): number {
  const nums = [...content.matchAll(/>>(\d{1,6})/g)].map((m) => Number(m[1]));
  return nums.length ? Math.min(...nums) : 0;
}

export function validatePost(
  body: unknown,
):
  | { ok: true; threadId: string; content: string; author: string }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "不正なリクエストです" };
  }
  const b = body as Record<string, unknown>;
  const threadId = typeof b.threadId === "string" ? b.threadId : "";
  const content = typeof b.content === "string" ? b.content.trim() : "";
  const author =
    (typeof b.author === "string" ? b.author.trim() : "") || DEFAULT_AUTHOR;
  if (!/^[A-Za-z0-9]{10,40}$/.test(threadId)) {
    return { ok: false, error: "スレッドが不正です" };
  }
  if (!content) return { ok: false, error: "投稿内容を入力してください" };
  if (content.length > MAX_CONTENT) {
    return {
      ok: false,
      error: `本文は${MAX_CONTENT}文字以内で入力してください`,
    };
  }
  if (author.length > MAX_AUTHOR) {
    return {
      ok: false,
      error: `名前は${MAX_AUTHOR}文字以内で入力してください`,
    };
  }
  return { ok: true, threadId, content, author };
}
