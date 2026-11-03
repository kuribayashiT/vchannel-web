import { StreamTabs } from "@/components/StreamTabs";
import { GcsFetchError, getLiveVideoList } from "@/lib/gcs";
import type { Video } from "@/types";

export default async function Home() {
  let videos: Video[] = [];
  let failed = false;
  try {
    videos = await getLiveVideoList();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
    failed = true;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4">
      <h1 className="mb-4 text-xl font-bold">配信</h1>
      {failed ? (
        <p className="py-16 text-center text-zinc-500">
          動画の読み込みに失敗しました。
        </p>
      ) : (
        <StreamTabs videos={videos} />
      )}
    </main>
  );
}
