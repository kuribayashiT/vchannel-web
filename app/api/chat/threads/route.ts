import { listThreads } from "@/lib/firestore";

export async function GET() {
  try {
    return Response.json(await listThreads());
  } catch {
    return Response.json({ error: "取得に失敗しました" }, { status: 502 });
  }
}
