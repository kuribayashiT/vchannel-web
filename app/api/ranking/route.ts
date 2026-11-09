import { connection } from "next/server";
import { GcsFetchError } from "@/lib/gcs";
import { getOtherRankingData } from "@/lib/ranking-data";

export async function GET() {
  await connection();
  try {
    return Response.json(await getOtherRankingData());
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
