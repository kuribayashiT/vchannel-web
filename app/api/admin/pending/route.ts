import { readVal, toRows, withAdmin } from "@/lib/admin/server";
import type { PendingCandidate } from "@/lib/admin/types";

/** 自動登録で保留になった候補（vtuberDiscovery/pending。毎日 0:30 の実行で作り直される） */
export async function GET(request: Request) {
  return withAdmin(request, async (db) => {
    const node = await readVal(db, "vtuberDiscovery/pending");
    const list: PendingCandidate[] = toRows(node)
      .map(([channelId, v]) => ({
        channelId,
        name: String(v.name ?? ""),
        org: String(v.org ?? ""),
        officeKey: String(v.officeKey ?? ""),
        subscribers: Number(v.subscribers ?? 0) || 0,
        twitter: String(v.twitter ?? ""),
        thumbnailUrl: String(v.thumbnailUrl ?? ""),
        reasons: Array.isArray(v.reasons) ? v.reasons.map(String) : [],
        lastSeenAt: String(v.lastSeenAt ?? ""),
      }))
      .sort((a, b) => b.subscribers - a.subscribers);
    return Response.json({ pending: list });
  });
}
