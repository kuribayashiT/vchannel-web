import { readVal, toRows, withAdmin } from "@/lib/admin/server";
import type { ExcludedEntry } from "@/lib/admin/types";

/** 自動登録の除外リスト */
export async function GET(request: Request) {
  return withAdmin(request, async (db) => {
    const node = await readVal(db, "vtuberDiscovery/excluded");
    const list: ExcludedEntry[] = toRows(node)
      .map(([channelId, v]) => ({
        channelId,
        name: String(v.name ?? ""),
        at: String(v.at ?? ""),
        reason: String(v.reason ?? ""),
      }))
      .sort((a, b) => b.at.localeCompare(a.at));
    return Response.json({ excluded: list });
  });
}
