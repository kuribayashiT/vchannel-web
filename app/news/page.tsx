import Link from "next/link";
import { SafeImage } from "@/components/SafeImage";
import { GcsFetchError, getNews } from "@/lib/gcs";
import { safeHttpUrl } from "@/lib/url";
import type { News } from "@/types";

export const metadata = { title: "ニュース" };

function NewsCard({ n }: { n: News }) {
  const url = safeHttpUrl(n.url);
  const videoUrl = n.videoUrl ? safeHttpUrl(n.videoUrl) : null;
  const imageSrc =
    n.urlToImage && safeHttpUrl(n.urlToImage)
      ? `/api/news-image?u=${encodeURIComponent(n.urlToImage)}`
      : null;
  const body = (
    <div className="flex gap-3">
      <SafeImage
        src={imageSrc}
        alt=""
        variant="thumbnail"
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-20 w-32 shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-blue-600">{n.channel || "ブログ記事"}</p>
        <p className="line-clamp-2 text-sm font-medium">{n.title}</p>
        <p className="text-xs text-zinc-500">{n.publishedAt}</p>
      </div>
    </div>
  );
  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      ) : (
        body
      )}
      {videoUrl && (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs text-red-600 underline"
        >
          ▶ 解説動画を見る
        </a>
      )}
    </li>
  );
}

export default async function NewsPage() {
  let news: News[] | null = null;
  try {
    news = await getNews();
  } catch (e) {
    if (!(e instanceof GcsFetchError)) throw e;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">ニュース</h1>
      {!news || news.length === 0 ? (
        <div className="py-16 text-center text-zinc-500">
          <p>ニュースデータの取得に失敗しました（空データ）</p>
          <Link
            href="/news"
            className="mt-4 inline-block rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            再読み込み
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {news.map((n, i) => (
            <NewsCard key={`${n.url}-${i}`} n={n} />
          ))}
        </ul>
      )}
    </main>
  );
}
