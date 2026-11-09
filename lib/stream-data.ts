import { cacheLife } from "next/cache";
import { getAllVideos } from "@/lib/gcs";
import { trimStreamVideos } from "@/lib/stream";

export async function getTrimmedStreamVideos() {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  return trimStreamVideos(await getAllVideos(), new Date());
}
