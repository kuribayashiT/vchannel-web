import Link from "next/link";
import { Suspense } from "react";
import { Detail } from "@/components/VTuberTabs";

export const metadata = { title: "VTuber詳細 | Vちゃんねる" };

async function Content({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  return <Detail channelId={channelId} />;
}

export default function VTuberDetailPage({
  params,
}: PageProps<"/vtuber/[channelId]">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <Link href="/vtuber" className="mb-4 inline-block text-sm text-blue-600">
        ‹ VTuber一覧
      </Link>
      <Suspense
        fallback={
          <p className="py-16 text-center text-zinc-500">
            Vtuberリストを読み込み中…
          </p>
        }
      >
        <Content params={params} />
      </Suspense>
    </main>
  );
}
