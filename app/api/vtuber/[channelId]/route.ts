import { loadVTubers } from "@/lib/server-data";

type RouteContext = { params: Promise<{ channelId: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const { channelId } = await ctx.params;
  try {
    const { details } = await loadVTubers();
    const detail = details.get(channelId);
    if (!detail) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(detail);
  } catch {
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
