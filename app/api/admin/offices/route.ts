import {
  addLog,
  HttpError,
  readJson,
  readVal,
  readValidOfficeKeys,
  toOfficeList,
  withAdmin,
} from "@/lib/admin/server";
import { MAX_TEXT, OFFICE_KEY_RE, RTDB_KEY_RE } from "@/lib/admin/types";

function readName(name: unknown): string {
  const v = typeof name === "string" ? name.trim() : "";
  if (!v || v.length > MAX_TEXT) throw new HttpError(400, "表示名を入力してください");
  return v;
}

/** 事務所の表示名を変える（officeMapping） */
export async function PATCH(request: Request) {
  return withAdmin(request, async (db) => {
    const body = await readJson<{ key?: string; name?: string }>(request);
    const key = String(body.key ?? "");
    const name = readName(body.name);
    if (!RTDB_KEY_RE.test(key)) {
      throw new HttpError(400, `「${key}」は名前を設定できないキーです`);
    }
    const valid = await readValidOfficeKeys(db);
    if (!valid.has(key)) throw new HttpError(404, "事務所が見つかりません");
    const [before, review] = await Promise.all([
      readVal(db, `officeMapping/${key}`),
      readVal(db, `vtuberDiscovery/offices/${key}`),
    ]);
    const updates: Record<string, unknown> = { [`officeMapping/${key}`]: name };
    if (review) updates[`vtuberDiscovery/offices/${key}/needsNameReview`] = false;
    addLog(db, updates, { action: "renameOffice", key, before, after: name });
    await db.ref().update(updates);
    return Response.json({ ok: true });
  });
}

/** 事務所を追加する（office の末尾と officeMapping） */
export async function POST(request: Request) {
  return withAdmin(request, async (db) => {
    const body = await readJson<{ key?: string; name?: string }>(request);
    const key = String(body.key ?? "").trim();
    const name = readName(body.name);
    if (!OFFICE_KEY_RE.test(key)) {
      throw new HttpError(400, "キーは英数字・-・_ のみ（40 文字以内）");
    }
    const valid = await readValidOfficeKeys(db);
    if (valid.has(key)) throw new HttpError(409, `「${key}」は既にあります`);
    const officeNode = await readVal(db, "office");
    const list = toOfficeList(officeNode);
    const nextIndex = Array.isArray(officeNode)
      ? officeNode.length
      : Math.max(-1, ...Object.keys((officeNode as object) ?? {}).map(Number).filter(Number.isFinite)) + 1;
    const updates: Record<string, unknown> = {
      [`office/${Math.max(nextIndex, list.length)}`]: key,
      [`officeMapping/${key}`]: name,
    };
    addLog(db, updates, { action: "addOffice", key, after: name });
    await db.ref().update(updates);
    return Response.json({ ok: true });
  });
}
