import type { NextRequest } from "next/server";
import {
  extractParentNo,
  isTopicId,
  TOPIC_ID_RE,
  validatePost,
  videoIdOfTopic,
} from "@/lib/chat";
import { getTopicVideo } from "@/lib/chat-topics";
import { addPost, FirestoreError, listPosts } from "@/lib/firestore";

const POSITIVE_INT = /^[1-9]\d{0,6}$/;
const MAX_LIMIT = 100;

/** 投稿の競合（楽観ロックの再試行上限超過）を表すエラーかどうか */
function isConflictError(e: unknown): boolean {
  return e instanceof FirestoreError && e.status === 409;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const threadId = sp.get("threadId") ?? "";
  if (!/^[A-Za-z0-9]{10,40}$/.test(threadId) && !TOPIC_ID_RE.test(threadId)) {
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
    // 話題スレは、配信データに動画があるときだけ書き込める
    // （ルールでは動画の実在を確認できないため、存在しない動画のスレを立てさせない）
    if (isTopicId(parsed.threadId)) {
      const video = await getTopicVideo(videoIdOfTopic(parsed.threadId));
      if (!video) {
        return Response.json(
          { error: "この配信には書き込めません" },
          { status: 400 },
        );
      }
    }

    // postNo は addPost 内で「最大 postNo + 1」（楽観ロック付き、最大 3 回試行）
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
