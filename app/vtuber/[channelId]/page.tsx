import Link from "next/link";
import { Suspense } from "react";
import { Detail } from "@/components/VTuberTabs";

type PageProps = { params: Promise<{ channelId: string }> };

export const metadata = { title: "VTuber詳細" };

async function Content({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  return <Detail channelId={channelId} />;
}

export default function VTuberDetailPage({ params }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 md:px-6 md:py-8">
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
