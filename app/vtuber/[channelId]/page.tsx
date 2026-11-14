import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { DetailView } from "@/components/VTuberTabs";
import { formatCompact, formatNumber } from "@/lib/format";
import { getCachedVTuberDetail, loadVTubers } from "@/lib/server-data";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { smallAvatar } from "@/lib/url";
import type { VTuberDetail, VTuberIndexItem } from "@/types";

type PageProps = { params: Promise<{ channelId: string }> };

const jstDate = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/**
 * 同じ事務所のメンバー（登録者数の降順で上位 limit 件）。
 * loadVTubers() の memo() は Date.now() を使うため、ページ本文から直接呼ばず
 * "use cache" 関数の中から呼ぶ（プリレンダーの unstable value 検出を避ける）。
 */
async function getCachedOfficeMembers(
  office: string,
  excludeChannelId: string,
  limit = 12,
): Promise<VTuberIndexItem[]> {
  "use cache";
  cacheLife("hours");
  const { index } = await loadVTubers();
  return index
    .filter((item) => item.office === office && item.channelId !== excludeChannelId)
    .sort((a, b) => b.subscriberCount - a.subscriberCount)
    .slice(0, limit);
}

function parseYmd(ymd: string): Date | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

function latestDateText(latestYmd: string | undefined): string {
  if (!latestYmd) return "最新";
  const d = parseYmd(latestYmd);
  if (!d) return "最新";
  return `${jstDate.format(d)}時点`;
}

function buildSummary(detail: VTuberDetail): string {
  const first = detail.transition[0];
  const latest = detail.transition.at(-1);
  const delta = latest && first ? latest.count - first.count : 0;
  let deltaText = "過去30日間の増減は確認できませんでした。";
  if (delta > 0) {
    deltaText = `過去30日間で${formatNumber(delta)}人増加しました。`;
  } else if (delta < 0) {
    deltaText = `過去30日間で${formatNumber(Math.abs(delta))}人減少しました。`;
  }
  return `${detail.name}は${detail.office}に所属するVTuberです。${latestDateText(latest?.date)}のYouTube登録者数は${formatNumber(detail.subscriberCount)}人（${formatCompact(detail.subscriberCount)}）で、${deltaText}`;
}

function metadataDescription(detail: VTuberDetail): string {
  return `${detail.office}所属のVTuber「${detail.name}」のYouTube登録者数（${formatCompact(detail.subscriberCount)}人）、登録者数推移、最新動画をまとめています。`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { channelId } = await params;
  const detail = await getCachedVTuberDetail(channelId);
  if (!detail) {
    return {
      title: "VTuberが見つかりません",
      description: "指定されたVTuberは見つかりませんでした。",
      alternates: { canonical: `/vtuber/${channelId}` },
      robots: { index: false, follow: false },
    };
  }

  const title = `${detail.name}の登録者数・配信情報`;
  const description = metadataDescription(detail);
  const canonical = `/vtuber/${channelId}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [{ url: `/vtuber/${channelId}/opengraph-image` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/vtuber/${channelId}/opengraph-image`],
    },
  };
}

export default async function VTuberDetailPage({ params }: PageProps) {
  const { channelId } = await params;
  const detail = await getCachedVTuberDetail(channelId);
  if (!detail) notFound();

  const officeMembers = await getCachedOfficeMembers(
    detail.office,
    detail.channelId,
    12,
  );

  const canonicalUrl = `${SITE_URL}/vtuber/${channelId}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${canonicalUrl}#profile`,
        url: canonicalUrl,
        name: `${detail.name}の登録者数・配信情報`,
        isPartOf: {
          "@type": "WebSite",
          "@id": `${SITE_URL}/#website`,
          name: SITE_NAME,
          url: SITE_URL,
        },
        mainEntity: {
          "@type": "Person",
          "@id": `${canonicalUrl}#person`,
          name: detail.name,
          image: detail.thumbnail,
          affiliation: {
            "@type": "Organization",
            name: detail.office,
          },
          sameAs: [`https://www.youtube.com/channel/${detail.channelId}`],
          interactionStatistic: {
            "@type": "InteractionCounter",
            interactionType: { "@type": "SubscribeAction" },
            userInteractionCount: detail.subscriberCount,
          },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "ホーム",
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "VTuber",
            item: `${SITE_URL}/vtuber`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: detail.name,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <nav
        aria-label="パンくず"
        className="mb-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"
      >
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
          ホーム
        </Link>
        <span aria-hidden>›</span>
        <Link
          href="/vtuber"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          VTuber
        </Link>
        <span aria-hidden>›</span>
        <span className="truncate text-zinc-800 dark:text-zinc-100">{detail.name}</span>
      </nav>

      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">{detail.name}</h1>
      <p className="mb-5 text-sm leading-7 text-zinc-700 dark:text-zinc-200">
        {buildSummary(detail)}
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <DetailView detail={detail} />

      {officeMembers.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-bold">
            同じ事務所のVTuber（登録者数上位）
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {officeMembers.map((member) => (
              <Link
                key={member.channelId}
                href={`/vtuber/${member.channelId}`}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 text-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                {member.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={smallAvatar(member.thumbnail, 64)}
                    alt=""
                    className="size-9 rounded-full object-cover"
                    loading="lazy"
                  />
                )}
                <span className="truncate">{member.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
