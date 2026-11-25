import type { NextRequest } from "next/server";
import { extractParentNo, validatePost } from "@/lib/chat";
import { addPost, listPosts } from "@/lib/firestore";

const POSITIVE_INT = /^[1-9]\d{0,6}$/;
const MAX_LIMIT = 100;

/** 投稿の競合（楽観ロックの再試行上限超過）を表すエラーかどうか */
function isConflictError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    (e as { status: unknown }).status === 409
  );
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const threadId = sp.get("threadId") ?? "";
  if (!/^[A-Za-z0-9]{10,40}$/.test(threadId)) {
    return Response.json({ error: "スレッドが不正です" }, { status: 400 });
  }

  const parsed: Record<"before" | "after" | "limit", number | undefined> = {
    before: undefined,
    after: undefined,
    limit: undefined,
  };
  for (const key of ["before", "after", "limit"] as const) {
    const raw = sp.get(key);
    if (raw === null) continue;
    if (!POSITIVE_INT.test(raw)) {
      return Response.json(
        { error: `${key} が不正です` },
        { status: 400 },
      );
    }
    parsed[key] = Number(raw);
  }
  if (parsed.before !== undefined && parsed.after !== undefined) {
    return Response.json(
      { error: "before と after は同時に指定できません" },
      { status: 400 },
    );
  }
  const limit =
    parsed.limit === undefined ? undefined : Math.min(parsed.limit, MAX_LIMIT);

  try {
    const page = await listPosts(threadId, {
      before: parsed.before,
      after: parsed.after,
      limit,
    });
    return Response.json({ posts: page.posts, hasMore: page.hasMore });
  } catch {
    return Response.json({ error: "取得に失敗しました" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const parsed = validatePost(await req.json().catch(() => null));
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const postNo = await addPost({
      ...parsed,
      parentNo: extractParentNo(parsed.content),
    });
    return Response.json({ postNo }, { status: 201 });
  } catch (e) {
    if (isConflictError(e)) {
      return Response.json(
        { error: "混み合っています。もう一度お試しください" },
        { status: 409 },
      );
    }
    return Response.json({ error: "投稿に失敗しました" }, { status: 502 });
  }
}
