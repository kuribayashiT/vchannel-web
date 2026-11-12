import { addLog, assertRtdbKey, readVal, withAdmin } from "@/lib/admin/server";

/** 除外を解除する（再登録は翌日以降の自動登録まかせ） */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ channelId: string }> },
) {
  return withAdmin(request, async (db) => {
    const { channelId } = await ctx.params;
    assertRtdbKey(channelId, "channelId");
    const before = await readVal(db, `vtuberDiscovery/excluded/${channelId}`);
    const updates: Record<string, unknown> = {
      [`vtuberDiscovery/excluded/${channelId}`]: null,
    };
    addLog(db, updates, { action: "unexclude", channelId, before });
    await db.ref().update(updates);
    return Response.json({ ok: true });
  });
}
