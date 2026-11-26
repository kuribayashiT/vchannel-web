import { getOfficeSummaries } from "@/lib/offices";

export async function GET() {
  try {
    const offices = await getOfficeSummaries();
    return Response.json(offices, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
