import { connection } from "next/server";
import { incrementNewsClick } from "@/lib/news-clicks";
import { getCachedNewsClusters } from "@/lib/server-data";

const NEWS_ID_RE = /^[0-9a-z]{1,8}$/;

async function readId(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as { id?: unknown };
    return typeof body.id === "string" ? body.id : null;
  } catch {
    return null;
  }
}

async function isCurrentNewsId(id: string): Promise<boolean> {
  const clusters = await getCachedNewsClusters();
  if (!clusters) return false;
  for (const cluster of clusters) {
    if (cluster.lead.id === id) return true;
    if (cluster.others.some((item) => item.id === id)) return true;
  }
  return false;
}

export async function POST(request: Request) {
  await connection();
  const id = await readId(request);
  if (!id || !NEWS_ID_RE.test(id)) return new Response(null, { status: 204 });
  if (!(await isCurrentNewsId(id))) return new Response(null, { status: 204 });

  await incrementNewsClick(id);
  return new Response(null, { status: 204 });
}
