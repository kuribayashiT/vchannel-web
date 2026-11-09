import { connection } from "next/server";
import { GcsFetchError, getLiveVideoList } from "@/lib/gcs";
import { toLiveStreamCardVideo, toStreamCardVideo } from "@/lib/stream";
import { getTrimmedStreamVideos } from "@/lib/stream-data";
import type { Video } from "@/types";

export async function GET() {
  await connection();
  let liveVideos: Video[];
  try {
    liveVideos = await getLiveVideoList();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
    return Response.json({ error: "failed" }, { status: 502 });
  }

  let allVideos: Video[];
  try {
    allVideos = await getTrimmedStreamVideos();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
    allVideos = [];
  }

  return Response.json({
    liveVideos: liveVideos.map(toLiveStreamCardVideo),
    allVideos: allVideos.map(toStreamCardVideo),
  });
}
