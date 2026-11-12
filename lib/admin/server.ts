import "server-only";
import { connection } from "next/server";
import type { Database } from "firebase-admin/database";
import { checkAdminAuth } from "@/lib/admin/auth";
import { AdminConfigError, getAdminDb } from "@/lib/admin/firebaseAdmin";
import {
  PERSONAL_OFFICE,
  RTDB_KEY_RE,
  type AdminOffice,
  type AdminVtuber,
} from "@/lib/admin/types";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** /api/admin/* の共通ラッパー。proxy.ts に加えてここでも認証する */
export async function withAdmin(
  request: Request,
  handler: (db: Database) => Promise<Response>,
): Promise<Response> {
  await connection();
  if (checkAdminAuth(request.headers.get("authorization")) !== "ok") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return await handler(getAdminDb());
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof AdminConfigError) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    console.error("[admin]", e);
    return Response.json({ error: "サーバーエラー" }, { status: 500 });
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "JSON を読めません");
  }
}

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const obj = <T>(v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as T) : null;

/** RTDB の `vtuber` は配列で返ることもあるので Object.entries で統一して読む */
export function toRows(node: unknown): [string, Row][] {
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).filter(
    (e): e is [string, Row] => !!e[1] && typeof e[1] === "object",
  );
}

export function toAdminVtuber(key: string, v: Row): AdminVtuber {
  return {
    key,
    name: str(v.name),
    channeID: str(v.channeID),
    office: str(v.office),
    officeFlg: v.officeFlg === true,
    twitterName: str(v.twitterName),
    birthday: str(v.birthday),
    debut: str(v.debut),
    description: str(v.description),
    thumbnailUrl: str(v.thumbnailUrl),
    createdAt: str(v.createdAt),
    updateTime: str(v.updateTime),
    registeredBy: str(v.registeredBy),
    discovery: obj(v.discovery),
    profileSource: obj(v.profileSource),
  };
}

/** `office` ノード（配列 or 数値キーのオブジェクト）を文字列配列にする */
export function toOfficeList(node: unknown): string[] {
  const values = Array.isArray(node)
    ? node
    : node && typeof node === "object"
      ? Object.entries(node as Record<string, unknown>)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, v]) => v)
      : [];
  return values.filter((v): v is string => typeof v === "string" && !!v);
}

export async function readVal(db: Database, path: string): Promise<unknown> {
  return (await db.ref(path).once("value")).val();
}

/**
 * 画面に出す事務所の一覧。並びは `office` ノード順 → その他の officeMapping
 * → VTuber が使っているが未登録のキー。個人勢は最後。
 * `office` に紛れたゴミ（メンバー 0 人かつ表示名なし）は出さない。
 */
export function buildOffices(
  officeNode: unknown,
  mapping: Record<string, string>,
  reviewNode: Record<string, { needsNameReview?: boolean }> | null,
  usedKeys: Set<string>,
): AdminOffice[] {
  const keys: string[] = [];
  const add = (k: string) => {
    if (k && !keys.includes(k)) keys.push(k);
  };
  for (const k of toOfficeList(officeNode)) {
    if (mapping[k] || usedKeys.has(k)) add(k);
  }
  for (const k of Object.keys(mapping)) add(k);
  for (const k of usedKeys) add(k);
  const ordered = [
    ...keys.filter((k) => k !== PERSONAL_OFFICE),
    PERSONAL_OFFICE,
  ];
  return ordered.map((key) => ({
    key,
    name:
      mapping[key] || (key === PERSONAL_OFFICE ? "個人勢" : key),
    needsNameReview: reviewNode?.[key]?.needsNameReview === true,
    renamable: RTDB_KEY_RE.test(key),
  }));
}

/** 事務所として受け付けるキー（`office` / officeMapping / 使用中 / 個人勢） */
export async function readValidOfficeKeys(
  db: Database,
  vtuberNode?: unknown,
): Promise<Set<string>> {
  const [officeNode, mapping, vtubers] = await Promise.all([
    readVal(db, "office"),
    readVal(db, "officeMapping"),
    vtuberNode === undefined ? readVal(db, "vtuber") : Promise.resolve(vtuberNode),
  ]);
  const set = new Set<string>([PERSONAL_OFFICE, ...toOfficeList(officeNode)]);
  for (const k of Object.keys((mapping as Record<string, string>) ?? {})) set.add(k);
  for (const [, v] of toRows(vtubers)) if (typeof v.office === "string" && v.office) set.add(v.office);
  return set;
}

/** 操作ログ `adminLog/{pushId}` を multi-path update に足す */
export function addLog(
  db: Database,
  updates: Record<string, unknown>,
  entry: { action: string; key?: string; channelId?: string; before?: unknown; after?: unknown },
): void {
  const id = db.ref("adminLog").push().key;
  updates[`adminLog/${id}`] = {
    at: new Date().toISOString(),
    action: entry.action,
    key: entry.key ?? null,
    channelId: entry.channelId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  };
}

export function assertRtdbKey(v: string, label: string): void {
  if (!RTDB_KEY_RE.test(v)) throw new HttpError(400, `${label} が不正です`);
}
