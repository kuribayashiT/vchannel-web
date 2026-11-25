import {
  isTopicId,
  videoIdOfTopic,
  type ChatPost,
  type ChatPostPage,
  type ChatThread,
} from "@/lib/chat";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "vtuber-335811";
const DB = `projects/${PROJECT}/databases/(default)`;
const BASE = `https://firestore.googleapis.com/v1/${DB}/documents`;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
/** 投稿の楽観ロックで、競合時にやり直す最大回数 */
const MAX_POST_ATTEMPTS = 3;

type Value = {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  timestampValue?: string;
};
type Fields = Record<string, Value | undefined>;
interface Doc {
  name: string;
  fields?: Fields;
  updateTime?: string;
}

const str = (f: Fields, k: string) => f[k]?.stringValue ?? "";
const int = (f: Fields, k: string) => Number(f[k]?.integerValue ?? 0);
const ts = (f: Fields, k: string) => f[k]?.timestampValue ?? null;
const idOf = (d: Doc) => d.name.split("/").pop() ?? "";

/** Firestore REST の失敗。status は HTTP ステータス、reason は本文の error.status */
export class FirestoreError extends Error {
  status: number;
  reason: string;

  constructor(status: number, reason = "", message?: string) {
    super(message ?? `Firestore ${status}${reason ? ` ${reason}` : ""}`);
    this.name = "FirestoreError";
    this.status = status;
    this.reason = reason;
  }
}

/** エラー本文（オブジェクトまたは配列）から error.status を取り出す */
function reasonOf(body: unknown): string {
  const first = Array.isArray(body) ? body[0] : body;
  if (typeof first !== "object" || first === null) return "";
  const err = (first as { error?: unknown }).error;
  if (typeof err !== "object" || err === null) return "";
  const status = (err as { status?: unknown }).status;
  return typeof status === "string" ? status : "";
}

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new FirestoreError(res.status, reasonOf(body));
  }
  return res.json();
}

export async function listThreads(): Promise<ChatThread[]> {
  const out: ChatThread[] = [];
  let token = "";
  do {
    const data = await call(
      `${BASE}/threads?pageSize=300${token ? `&pageToken=${token}` : ""}`,
    );
    for (const d of (data.documents ?? []) as Doc[]) {
      const f = d.fields ?? {};
      out.push({
        id: idOf(d),
        name: str(f, "name"),
        office: str(f, "office"),
        postCount: int(f, "postCount"),
        lastUpdated: ts(f, "lastUpdated"),
      });
    }
    token = data.nextPageToken ?? "";
  } while (token);
  return out;
}

export type TopicDocSummary = {
  id: string;
  videoId: string;
  postCount: number;
  lastUpdated: string | null;
};

export type TopicDoc = TopicDocSummary & { updateTime: string | null };

function toTopicSummary(d: Doc): TopicDocSummary {
  const f = d.fields ?? {};
  const id = idOf(d);
  return {
    id,
    videoId: str(f, "videoId") || videoIdOfTopic(id),
    postCount: int(f, "postCount"),
    lastUpdated: ts(f, "lastUpdated"),
  };
}

/**
 * topics を lastUpdated 降順で limit 件取得する（where なし。単一フィールドの
 * 自動インデックスだけで動くので、インデックス追加は不要）。
 */
export async function listTopicDocs(limit = 30): Promise<TopicDocSummary[]> {
  const rows = (await call(`${BASE}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "topics" }],
        orderBy: [
          { field: { fieldPath: "lastUpdated" }, direction: "DESCENDING" },
        ],
        limit,
      },
    }),
  })) as { document?: Doc }[];
  return rows.flatMap((r) => (r.document ? [toTopicSummary(r.document)] : []));
}

/** topics/{topicId} を 1 件取得。存在しなければ null */
export async function getTopicDoc(topicId: string): Promise<TopicDoc | null> {
  try {
    const doc = (await call(`${BASE}/topics/${topicId}`)) as Doc;
    return { ...toTopicSummary(doc), updateTime: doc.updateTime ?? null };
  } catch (e) {
    if (e instanceof FirestoreError && e.status === 404) return null;
    throw e;
  }
}

type FieldFilter = {
  fieldFilter: {
    field: { fieldPath: string };
    op: "EQUAL" | "LESS_THAN" | "GREATER_THAN";
    value: Value;
  };
};

function fieldFilter(
  fieldPath: string,
  op: FieldFilter["fieldFilter"]["op"],
  value: Value,
): FieldFilter {
  return { fieldFilter: { field: { fieldPath }, op, value } };
}

function threadFilter(threadId: string): FieldFilter {
  return fieldFilter("threadId", "EQUAL", { stringValue: threadId });
}

export type ListPostsOptions = {
  before?: number;
  after?: number;
  limit?: number;
};

/**
 * threadId 昇順 + postNo 降順の複合インデックスで、新しい方から limit 件取得し、
 * 昇順に並べ直して返す。
 * - before: postNo < before（さらに古い投稿）
 * - after: postNo > after（新着。hasMore は常に false）
 */
export async function listPosts(
  threadId: string,
  opts: ListPostsOptions = {},
): Promise<ChatPostPage> {
  const rawLimit = Number.isFinite(opts.limit) ? Math.floor(opts.limit ?? 0) : DEFAULT_LIMIT;
  const limit = Math.min(Math.max(rawLimit || DEFAULT_LIMIT, 1), MAX_LIMIT);

  const filters: FieldFilter[] = [threadFilter(threadId)];
  if (opts.before !== undefined) {
    filters.push(
      fieldFilter("postNo", "LESS_THAN", { integerValue: String(opts.before) }),
    );
  }
  if (opts.after !== undefined) {
    filters.push(
      fieldFilter("postNo", "GREATER_THAN", {
        integerValue: String(opts.after),
      }),
    );
  }
  const where =
    filters.length === 1
      ? filters[0]
      : { compositeFilter: { op: "AND", filters } };

  const rows = (await call(`${BASE}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "posts" }],
        where,
        orderBy: [{ field: { fieldPath: "postNo" }, direction: "DESCENDING" }],
        limit,
      },
    }),
  })) as { document?: Doc }[];

  const posts: ChatPost[] = rows
    .flatMap((r) => (r.document ? [r.document] : []))
    .map((d) => {
      const f = d.fields ?? {};
      return {
        id: idOf(d),
        threadId: str(f, "threadId"),
        author: str(f, "author"),
        content: str(f, "content"),
        postNo: int(f, "postNo"),
        parentNo: int(f, "parentNo"),
        isBot: f.isBot?.booleanValue ?? false,
        createdAt: ts(f, "createdAt"),
      };
    })
    .sort((a, b) => a.postNo - b.postNo);

  const hasMore = opts.after !== undefined ? false : posts.length === limit;
  return { posts, hasMore };
}

/**
 * スレッド内の最大 postNo + 1 を返す（0 件なら 1）。
 * threadId 昇順 + postNo 降順の複合インデックスを使う。
 */
export async function nextPostNo(threadId: string): Promise<number> {
  const rows = (await call(`${BASE}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "posts" }],
        where: threadFilter(threadId),
        orderBy: [{ field: { fieldPath: "postNo" }, direction: "DESCENDING" }],
        limit: 1,
      },
    }),
  })) as { document?: Doc }[];
  const top = rows.find((r) => r.document)?.document;
  const max = top ? int(top.fields ?? {}, "postNo") : 0;
  return (Number.isFinite(max) ? max : 0) + 1;
}

type PostInput = {
  threadId: string;
  content: string;
  author: string;
  parentNo: number;
};

type Write = Record<string, unknown>;

/** posts の作成書き込み（事務所スレッド・話題スレ共通） */
function buildPostWrite(input: PostInput, postNo: number): Write {
  const postId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return {
    update: {
      name: `${DB}/documents/posts/${postId}`,
      fields: {
        threadId: { stringValue: input.threadId },
        content: { stringValue: input.content },
        author: { stringValue: input.author },
        postNo: { integerValue: String(postNo) },
        parentNo: { integerValue: String(input.parentNo) },
        isBot: { booleanValue: false },
      },
    },
    updateTransforms: [
      { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
    ],
    currentDocument: { exists: false },
  };
}

/** 話題スレの競合（前提条件の不一致・すでに存在）かどうか */
function isTopicConflict(e: unknown): boolean {
  if (!(e instanceof FirestoreError)) return false;
  if (e.status === 400 && e.reason === "FAILED_PRECONDITION") return true;
  if (e.status === 409 && e.reason === "ALREADY_EXISTS") return true;
  return false;
}

/**
 * 話題スレへの投稿。最初の投稿は post と topics/{id} の作成を同じ commit で書く
 * （本番ルールの existsAfter で、topic が同時に作られない post は拒否されるため）。
 * 2 件目以降は topic の lastUpdated / postCount(+1) を更新する。
 * 競合なら最大 3 回、topic の GET からやり直す。
 */
async function addTopicPost(input: PostInput): Promise<number> {
  const topicId = input.threadId;
  const videoId = videoIdOfTopic(topicId);
  const topicName = `${DB}/documents/topics/${topicId}`;

  for (let attempt = 0; attempt < MAX_POST_ATTEMPTS; attempt++) {
    const topic = await getTopicDoc(topicId);
    const postNo = await nextPostNo(topicId);
    const postWrite = buildPostWrite(input, postNo);

    let topicWrite: Write;
    if (!topic) {
      topicWrite = {
        update: {
          name: topicName,
          fields: {
            kind: { stringValue: "video" },
            videoId: { stringValue: videoId },
            postCount: { integerValue: "1" },
          },
        },
        updateTransforms: [
          { fieldPath: "lastUpdated", setToServerValue: "REQUEST_TIME" },
          { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
        ],
        currentDocument: { exists: false },
      };
    } else {
      topicWrite = {
        transform: {
          document: topicName,
          fieldTransforms: [
            { fieldPath: "lastUpdated", setToServerValue: "REQUEST_TIME" },
            { fieldPath: "postCount", increment: { integerValue: "1" } },
          ],
        },
        currentDocument: topic.updateTime
          ? { updateTime: topic.updateTime }
          : { exists: true },
      };
    }

    try {
      await call(`${BASE}:commit`, {
        method: "POST",
        body: JSON.stringify({ writes: [postWrite, topicWrite] }),
      });
      return postNo;
    } catch (e) {
      if (!isTopicConflict(e)) throw e;
      // 他の投稿が先に入った（同時に最初の投稿が起きた場合を含む）: GET からやり直す
    }
  }

  throw new FirestoreError(409, "CONFLICT", "Firestore conflict");
}

/**
 * 既存アプリと同じ形式で posts を追加し、threads を更新する（1コミットで原子的に）。
 * postNo は「最大 postNo + 1」。thread 文書の updateTime を前提条件にした楽観ロックで、
 * 競合（FAILED_PRECONDITION）なら最大 3 回やり直す。3 回とも失敗したら status 409 の Error。
 * threadId が話題スレ（v_{動画ID}）のときは topics を更新する（addTopicPost）。
 */
export async function addPost(input: PostInput): Promise<number> {
  if (isTopicId(input.threadId)) return addTopicPost(input);

  const threadName = `${DB}/documents/threads/${input.threadId}`;

  for (let attempt = 0; attempt < MAX_POST_ATTEMPTS; attempt++) {
    // 1. thread を GET して updateTime を控える
    const thread = (await call(`${BASE}/threads/${input.threadId}`)) as Doc;
    const updateTime = thread.updateTime;
    if (!updateTime) throw new FirestoreError(502, "NO_UPDATE_TIME");

    // 2. 最大 postNo + 1
    const postNo = await nextPostNo(input.threadId);

    // 3. post 作成 + thread 更新を 1 回の commit で
    try {
      await call(`${BASE}:commit`, {
        method: "POST",
        body: JSON.stringify({
          writes: [
            buildPostWrite(input, postNo),
            {
              transform: {
                document: threadName,
                fieldTransforms: [
                  {
                    fieldPath: "lastUpdated",
                    setToServerValue: "REQUEST_TIME",
                  },
                  { fieldPath: "postCount", increment: { integerValue: "1" } },
                ],
              },
              currentDocument: { updateTime },
            },
          ],
        }),
      });
      return postNo;
    } catch (e) {
      const conflict =
        e instanceof FirestoreError &&
        e.status === 400 &&
        e.reason === "FAILED_PRECONDITION";
      if (!conflict) throw e;
      // 他の投稿が先に入った: 手順 1 からやり直す
    }
  }

  throw new FirestoreError(409, "CONFLICT", "Firestore conflict");
}
