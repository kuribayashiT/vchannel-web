import { connection } from "next/server";
import { loadVTubers } from "@/lib/server-data";

export async function GET() {
  await connection();
  try {
    const { index } = await loadVTubers();
    return Response.json(index);
  } catch {
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
