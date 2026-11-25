import type { ChatPost, ChatPostPage, ChatThread } from "@/lib/chat";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "vtuber-335811";
const DB = `projects/${PROJECT}/databases/(default)`;
const BASE = `https://firestore.googleapis.com/v1/${DB}/documents`;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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
}

const str = (f: Fields, k: string) => f[k]?.stringValue ?? "";
const int = (f: Fields, k: string) => Number(f[k]?.integerValue ?? 0);
const ts = (f: Fields, k: string) => f[k]?.timestampValue ?? null;
const idOf = (d: Doc) => d.name.split("/").pop() ?? "";

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Firestore ${res.status}`);
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

async function countPosts(threadId: string): Promise<number> {
  const rows = await call(`${BASE}:runAggregationQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery: {
          from: [{ collectionId: "posts" }],
          where: threadFilter(threadId),
        },
        aggregations: [{ alias: "n", count: {} }],
      },
    }),
  });
  return Number(rows[0]?.result?.aggregateFields?.n?.integerValue ?? 0);
}

/** 既存アプリと同じ形式で posts を追加し、threads を更新する（1コミットで原子的に） */
export async function addPost(input: {
  threadId: string;
  content: string;
  author: string;
  parentNo: number;
}): Promise<number> {
  const postNo = (await countPosts(input.threadId)) + 1;
  const postId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  await call(`${BASE}:commit`, {
    method: "POST",
    body: JSON.stringify({
      writes: [
        {
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
        },
        {
          transform: {
            document: `${DB}/documents/threads/${input.threadId}`,
            fieldTransforms: [
              { fieldPath: "lastUpdated", setToServerValue: "REQUEST_TIME" },
              { fieldPath: "postCount", increment: { integerValue: "1" } },
            ],
          },
          currentDocument: { exists: true },
        },
      ],
    }),
  });
  return postNo;
}
