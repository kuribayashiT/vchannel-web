import { loadAllVideos } from "@/lib/server-data";

const MAX_IDS = 200;
const ID_RE = /^[\w-]{1,32}$/;

/** GET /api/videos?ids=a,b,c — お気に入り用に videoID から動画を引く */
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .filter((id) => ID_RE.test(id))
    .slice(0, MAX_IDS);
  if (ids.length === 0) return Response.json([]);
  try {
    const map = await loadAllVideos();
    return Response.json(ids.flatMap((id) => map.get(id) ?? []));
  } catch {
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
