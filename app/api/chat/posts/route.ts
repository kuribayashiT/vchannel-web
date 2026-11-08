import type { NextRequest } from "next/server";
import { extractParentNo, validatePost } from "@/lib/chat";
import { addPost, listPosts } from "@/lib/firestore";

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
  const threadId = req.nextUrl.searchParams.get("threadId") ?? "";
  if (!/^[A-Za-z0-9]{10,40}$/.test(threadId)) {
    return Response.json({ error: "スレッドが不正です" }, { status: 400 });
  }
  try {
    return Response.json(await listPosts(threadId));
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
