import { loadVTubers } from "@/lib/server-data";
import {
  addLog,
  buildOffices,
  HttpError,
  readJson,
  readVal,
  readValidOfficeKeys,
  toAdminVtuber,
  toRows,
  withAdmin,
} from "@/lib/admin/server";
import {
  EDITABLE_FIELDS,
  normalizeField,
  type AdminBoardData,
  type EditableField,
  type VtuberChange,
} from "@/lib/admin/types";

/** 事務所ボードの全データ */
export async function GET(request: Request) {
  return withAdmin(request, async (db) => {
    const [vtuberNode, officeNode, mapping, review, gcs] = await Promise.all([
      readVal(db, "vtuber"),
      readVal(db, "office"),
      readVal(db, "officeMapping"),
      readVal(db, "vtuberDiscovery/offices"),
      // 登録者数は公開データ（1 時間メモリキャッシュ）から。取れなくても画面は出す
      loadVTubers().catch(() => null),
    ]);
    const vtubers = toRows(vtuberNode).map(([k, v]) => toAdminVtuber(k, v));
    const used = new Set(vtubers.map((v) => v.office).filter(Boolean));
    const subscribers: Record<string, number> = {};
    for (const item of gcs?.index ?? []) subscribers[item.channelId] = item.subscriberCount;
    const body: AdminBoardData = {
      vtubers,
      offices: buildOffices(
        officeNode,
        (mapping as Record<string, string>) ?? {},
        review as Record<string, { needsNameReview?: boolean }> | null,
        used,
      ),
      subscribers,
    };
    return Response.json(body);
  });
}

/** 複数 VTuber のフィールド単位の更新（1 回の multi-path update） */
export async function PATCH(request: Request) {
  return withAdmin(request, async (db) => {
    const { changes } = await readJson<{ changes?: VtuberChange[] }>(request);
    if (!Array.isArray(changes) || changes.length === 0 || changes.length > 500) {
      throw new HttpError(400, "changes は 1〜500 件の配列");
    }
    const vtuberNode = await readVal(db, "vtuber");
    const rows = new Map(toRows(vtuberNode));
    const validOffices = await readValidOfficeKeys(db, vtuberNode);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    const touched = new Set<string>();

    for (const change of changes) {
      const key = String(change?.key ?? "");
      const row = rows.get(key);
      if (!row) throw new HttpError(400, `VTuber ${key} が見つかりません`);
      const fields = change.fields ?? {};
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const [field, raw] of Object.entries(fields)) {
        if (!EDITABLE_FIELDS.includes(field as EditableField)) {
          throw new HttpError(400, `${field} は編集できません`);
        }
        let value: string | boolean;
        try {
          value = normalizeField(field as EditableField, raw);
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
        if (field === "office" && !validOffices.has(value as string)) {
          throw new HttpError(400, `事務所 ${String(value)} は存在しません`);
        }
        const current = field === "officeFlg" ? row[field] === true : (row[field] ?? "");
        if (current === value) continue;
        updates[`vtuber/${key}/${field}`] = value;
        before[field] = row[field] ?? null;
        after[field] = value;
        if (field === "birthday" || field === "debut") {
          updates[`vtuber/${key}/profileSource/${field}`] = "manual";
        }
      }
      if (Object.keys(after).length === 0) continue;
      updates[`vtuber/${key}/updateTime`] = now;
      addLog(db, updates, {
        action: "update",
        key,
        channelId: String(row.channeID ?? ""),
        before,
        after,
      });
      touched.add(key);
    }

    if (touched.size) await db.ref().update(updates);
    const fresh = await Promise.all(
      [...touched].map(async (k) => {
        const v = (await readVal(db, `vtuber/${k}`)) as Record<string, unknown>;
        return toAdminVtuber(k, v);
      }),
    );
    return Response.json({ updated: fresh });
  });
}
