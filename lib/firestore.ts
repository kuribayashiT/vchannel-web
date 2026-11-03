import type { ChatPost, ChatThread } from "@/lib/chat";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "vtuber-335811";
const DB = `projects/${PROJECT}/databases/(default)`;
const BASE = `https://firestore.googleapis.com/v1/${DB}/documents`;

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

function threadFilter(threadId: string) {
  return {
    fieldFilter: {
      field: { fieldPath: "threadId" },
      op: "EQUAL",
      value: { stringValue: threadId },
    },
  };
}

/** 複合インデックス不要にするため、取得後に postNo 昇順へ並べ替える */
export async function listPosts(threadId: string): Promise<ChatPost[]> {
  const rows = (await call(`${BASE}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "posts" }],
        where: threadFilter(threadId),
        limit: 1000,
      },
    }),
  })) as { document?: Doc }[];
  return rows
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
