import {
  addLog,
  assertRtdbKey,
  HttpError,
  readJson,
  readVal,
  readValidOfficeKeys,
  toAdminVtuber,
  toRows,
  withAdmin,
} from "@/lib/admin/server";

type Body = { action?: "register" | "reject"; officeKey?: string; officeFlg?: boolean };

/** 保留候補を登録 / 却下（却下は除外リストへ） */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ channelId: string }> },
) {
  return withAdmin(request, async (db) => {
    const { channelId } = await ctx.params;
    assertRtdbKey(channelId, "channelId");
    const body = await readJson<Body>(request);
    const cand = (await readVal(db, `vtuberDiscovery/pending/${channelId}`)) as
      | Record<string, unknown>
      | null;
    if (!cand) throw new HttpError(404, "保留候補が見つかりません");
    const name = String(cand.name ?? "");
    const now = new Date().toISOString();

    if (body.action === "reject") {
      const updates: Record<string, unknown> = {
        [`vtuberDiscovery/pending/${channelId}`]: null,
        [`vtuberDiscovery/excluded/${channelId}`]: { name, at: now, reason: "保留候補を却下" },
      };
      addLog(db, updates, { action: "rejectPending", channelId, before: cand });
      await db.ref().update(updates);
      return Response.json({ ok: true });
    }

    if (body.action !== "register") throw new HttpError(400, "action が不正です");
    const officeKey = String(body.officeKey ?? "").trim();
    const vtuberNode = await readVal(db, "vtuber");
    const rows = toRows(vtuberNode);
    if (rows.some(([, v]) => v.channeID === channelId)) {
      throw new HttpError(409, "このチャンネルは登録済みです");
    }
    const valid = await readValidOfficeKeys(db, vtuberNode);
    if (!valid.has(officeKey)) throw new HttpError(400, "事務所を選んでください");

    const signals = (cand.signals as Record<string, unknown>) ?? {};
    const row = {
      name,
      channeID: channelId,
      office: officeKey,
      officeFlg: body.officeFlg === true,
      twitterName: String(cand.twitter ?? ""),
      thumbnailUrl: String(cand.thumbnailUrl ?? ""),
      description: "",
      birthday: "",
      debut: "",
      createdAt: now,
      updateTime: now,
      registeredBy: "admin",
      discovery: {
        holodexOrg: String(cand.org ?? ""),
        subscribersAtRegistration: Number(cand.subscribers ?? 0) || 0,
        wikidata: String(signals.wikidata ?? ""),
        knownOffice: signals.knownOffice === true,
        keyword: signals.keyword === true,
      },
    };

    // 数値キーの最大 + 1。自動登録ジョブと衝突しないよう transaction で確保する
    const maxKey = Math.max(0, ...rows.map(([k]) => parseInt(k, 10)).filter(Number.isFinite));
    let key = "";
    for (let n = maxKey + 1; n <= maxKey + 20; n++) {
      const res = await db
        .ref(`vtuber/${n}`)
        .transaction((cur) => (cur === null ? row : undefined));
      if (res.committed) {
        key = String(n);
        break;
      }
    }
    if (!key) throw new HttpError(409, "キーを確保できませんでした。再度お試しください");

    const updates: Record<string, unknown> = {
      [`vtuberDiscovery/pending/${channelId}`]: null,
    };
    addLog(db, updates, { action: "registerPending", key, channelId, after: row });
    await db.ref().update(updates);
    return Response.json({ vtuber: toAdminVtuber(key, row) });
  });
}
