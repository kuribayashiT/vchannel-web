import { addLog, HttpError, readJson, readVal, withAdmin } from "@/lib/admin/server";
import { RTDB_KEY_RE } from "@/lib/admin/types";

/** VTuber を削除し、自動登録の除外リストに入れる */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ key: string }> },
) {
  return withAdmin(request, async (db) => {
    const { key } = await ctx.params;
    if (!RTDB_KEY_RE.test(key)) throw new HttpError(400, "key が不正です");
    const body = await readJson<{ reason?: string }>(request).catch(() => ({ reason: "" }));
    const row = (await readVal(db, `vtuber/${key}`)) as Record<string, unknown> | null;
    if (!row || typeof row !== "object") throw new HttpError(404, "見つかりません");
    const channelId = typeof row.channeID === "string" ? row.channeID : "";
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { [`vtuber/${key}`]: null };
    if (channelId && RTDB_KEY_RE.test(channelId)) {
      updates[`vtuberDiscovery/excluded/${channelId}`] = {
        name: typeof row.name === "string" ? row.name : "",
        at: now,
        reason: String(body.reason ?? "").slice(0, 500),
        key,
      };
    }
    addLog(db, updates, { action: "delete", key, channelId, before: row });
    await db.ref().update(updates);
    return Response.json({ ok: true });
  });
}
