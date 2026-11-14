import { getOfficeThumbnails } from "@/lib/offices";

export async function GET() {
  try {
    const thumbnails = await getOfficeThumbnails();
    return Response.json(thumbnails, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
