import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { DetailView } from "@/components/VTuberTabs";
import { formatDateSlug, todayJstParts } from "@/lib/events";
import { formatCompact, formatNumber } from "@/lib/format";
import {
  getCachedVTuberDetail,
  getCachedVTuberPageData,
} from "@/lib/server-data";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { smallAvatar } from "@/lib/url";
import type { VTuberDetail, VTuberIndexItem } from "@/types";

type PageProps = { params: Promise<{ channelId: string }> };

type VTuberRanks = {
  overall: number;
  total: number;
  inOffice: number;
  officeTotal: number;
};

type NearbyVTubers = {
  /** 本人より登録者数が多い人（本人に近い順） */
  above: VTuberIndexItem[];
  /** 本人より登録者数が少ない人（本人に近い順） */
  below: VTuberIndexItem[];
};

const jstDate = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
});

async function getCachedOfficeMembers(
  office: string,
  excludeChannelId: string,
  limit = 12,
): Promise<VTuberIndexItem[]> {
  "use cache";
  cacheLife("hours");
  const { directoryItems } = await getCachedVTuberPageData();
  return directoryItems
    .filter((item) => item.office === office && item.channelId !== excludeChannelId)
    .sort((a, b) => b.subscriberCount - a.subscriberCount)
    .slice(0, limit);
}

/** 事務所の公式チャンネル（officeFlg）を除き、登録者数の降順に並べた全 VTuber */
async function getRankedItems(): Promise<VTuberIndexItem[]> {
  const { directoryItems } = await getCachedVTuberPageData();
  return directoryItems
    .filter((item) => item.officeFlg !== true)
    .sort((a, b) => b.subscriberCount - a.subscriberCount);
}

/** 順位（公式チャンネルを除いて数える）。公式チャンネル自身は null */
async function getCachedRanks(channelId: string): Promise<VTuberRanks | null> {
  "use cache";
  cacheLife("hours");
  const ranked = await getRankedItems();
  const index = ranked.findIndex((item) => item.channelId === channelId);
  if (index < 0) return null;
  const self = ranked[index];
  const sameOffice = ranked.filter((item) => item.office === self.office);
  const inOfficeIndex = sameOffice.findIndex((item) => item.channelId === channelId);
  return {
    overall: index + 1,
    total: ranked.length,
    inOffice: inOfficeIndex + 1,
    officeTotal: sameOffice.length,
  };
}

/** 登録者数が近い VTuber（公式チャンネルを除く）。上下それぞれ本人に近い順で返す */
async function getCachedNearby(
  channelId: string,
  limit: number,
): Promise<NearbyVTubers> {
  "use cache";
  cacheLife("hours");
  const ranked = await getRankedItems();
  const index = ranked.findIndex((item) => item.channelId === channelId);
  if (index < 0) return { above: [], below: [] };
  const half = Math.floor(limit / 2);
  const afterAvailable = ranked.length - index - 1;
  const beforeCount0 = Math.min(half, index);
  const afterCount = Math.min(limit - beforeCount0, afterAvailable);
  const beforeCount = Math.min(index, limit - afterCount);
  return {
    above: ranked.slice(index - beforeCount, index).reverse(),
    below: ranked.slice(index + 1, index + 1 + afterCount),
  };
}

/** 上下を交互に拾って（本人に近い順）最大 max 人にし、登録者数の降順に戻す */
function pickBalanced(
  nearby: NearbyVTubers,
  max: number,
  excludeIds: Set<string>,
): VTuberIndexItem[] {
  const above = nearby.above.filter((m) => !excludeIds.has(m.channelId));
  const below = nearby.below.filter((m) => !excludeIds.has(m.channelId));
  const picked: VTuberIndexItem[] = [];
  let i = 0;
  while (picked.length < max && (i < above.length || i < below.length)) {
    if (i < above.length && picked.length < max) picked.push(above[i]);
    if (i < below.length && picked.length < max) picked.push(below[i]);
    i += 1;
  }
  return picked.sort((a, b) => b.subscriberCount - a.subscriberCount);
}

async function getCurrentJstYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return todayJstParts().y;
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

function buildSummary(detail: VTuberDetail, ranks: VTuberRanks | null): string {
  const first = detail.transition[0];
  const latest = detail.transition.at(-1);
  const summary: string[] = [];
  if (detail.office === "個人") {
    summary.push(`${detail.name}は個人で活動するVTuberです。`);
  } else {
    summary.push(`${detail.name}は${detail.office}に所属するVTuberです。`);
  }
  if (ranks) {
    summary.push(
      `Vちゃんねるに登録している${formatNumber(ranks.total)}人のVTuberのうち、登録者数は${formatNumber(ranks.overall)}位です。`,
    );
    if (detail.office !== "個人") {
      summary.push(
        `${detail.office}の中では${formatNumber(ranks.officeTotal)}人中${formatNumber(ranks.inOffice)}位です。`,
      );
    }
  }
  summary.push(
    `${latestDateText(latest?.date)}のYouTube登録者数は${formatNumber(detail.subscriberCount)}人（${formatCompact(detail.subscriberCount)}）です。`,
  );
  if (detail.transition.length >= 2 && first && latest) {
    const delta = latest.count - first.count;
    if (delta > 0) {
      summary.push(`過去30日間で${formatNumber(delta)}人増加しました。`);
    } else if (delta < 0) {
      summary.push(`過去30日間で${formatNumber(Math.abs(delta))}人減少しました。`);
    } else {
      summary.push("過去30日間の登録者数は横ばいです。");
    }
  }
  const statSummary: string[] = [];
  if (detail.viewCount > 0) {
    statSummary.push(`YouTubeの総再生数は${formatCompact(detail.viewCount)}回`);
  }
  if (detail.videoCount > 0) {
    statSummary.push(`動画本数は${formatNumber(detail.videoCount)}本`);
  }
  if (statSummary.length > 0) {
    summary.push(`${statSummary.join("、")}です。`);
  }
  const profileDates = [
    detail.birthday &&
      `誕生日は${detail.birthday.month}月${detail.birthday.day}日`,
    detail.debut &&
      `デビューは${detail.debut.year ? `${detail.debut.year}年` : ""}${detail.debut.month}月${detail.debut.day}日`,
  ].filter((value): value is string => Boolean(value));
  if (profileDates.length > 0) {
    summary.push(`${profileDates.join("、")}です。`);
  }
  return summary.join("");
}

function anniversaryText(years: number): string {
  return `今年で${formatNumber(years)}周年です。`;
}

function RelatedVTuberGrid({
  title,
  members,
  showSubscriberCount = false,
}: {
  title: string;
  members: VTuberIndexItem[];
  showSubscriberCount?: boolean;
}) {
  if (members.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {members.map((member) => (
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
            <div className="min-w-0">
              <span className="block truncate">{member.name}</span>
              {showSubscriberCount && (
                <span className="block text-xs text-zinc-500">
                  登録者数 {formatCompact(member.subscriberCount)}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
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

  const isPersonal = detail.office === "個人";
  const [officeMembers, nearby, ranks, currentYear] = await Promise.all([
    getCachedOfficeMembers(detail.office, detail.channelId, 12),
    getCachedNearby(detail.channelId, isPersonal ? 12 : 24),
    getCachedRanks(detail.channelId),
    getCurrentJstYear(),
  ]);
  const officeMemberIds = new Set(officeMembers.map((member) => member.channelId));
  const nearbyMembers = isPersonal
    ? [...nearby.above].reverse().concat(nearby.below)
    : pickBalanced(nearby, 6, officeMemberIds);
  const latest = detail.transition.at(-1);
  const birthdaySlug = detail.birthday
    ? formatDateSlug(detail.birthday.month, detail.birthday.day)
    : null;
  const debutSlug = detail.debut
    ? formatDateSlug(detail.debut.month, detail.debut.day)
    : null;
  const debutYears = detail.debut?.year ? currentYear - detail.debut.year : 0;

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
        {buildSummary(detail, ranks)}
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <DetailView detail={detail} />

      {isPersonal ? (
        <RelatedVTuberGrid
          title="登録者数が近いVTuber"
          members={nearbyMembers}
          showSubscriberCount
        />
      ) : (
        <>
          <RelatedVTuberGrid
            title="同じ事務所のVTuber（登録者数上位）"
            members={officeMembers}
          />
          <RelatedVTuberGrid
            title="登録者数が近いVTuber"
            members={nearbyMembers}
            showSubscriberCount
          />
        </>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-base font-bold">よくある質問</h2>
        <dl className="space-y-2 text-sm leading-7 text-zinc-700 dark:text-zinc-200">
          {ranks && (
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <dt className="font-bold text-zinc-900 dark:text-zinc-100">
                {detail.name}のYouTube登録者数は？
              </dt>
              <dd className="mt-1">
                {latestDateText(latest?.date)}で{formatNumber(detail.subscriberCount)}
                人（全体{formatNumber(ranks.overall)}位）です。
              </dd>
            </div>
          )}
          {detail.birthday && birthdaySlug && (
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <dt className="font-bold text-zinc-900 dark:text-zinc-100">
                {detail.name}の誕生日はいつ？
              </dt>
              <dd className="mt-1">
                {detail.birthday.month}月{detail.birthday.day}日です。{" "}
                <Link
                  href={`/events/${birthdaySlug}`}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {detail.birthday.month}月{detail.birthday.day}日が誕生日のVTuberを見る
                </Link>
              </dd>
            </div>
          )}
          {detail.debut && debutSlug && (
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <dt className="font-bold text-zinc-900 dark:text-zinc-100">
                {detail.name}のデビュー日はいつ？
              </dt>
              <dd className="mt-1">
                {detail.debut.year ? `${detail.debut.year}年` : ""}
                {detail.debut.month}月{detail.debut.day}日です。{" "}
                {debutYears >= 1 ? <>{anniversaryText(debutYears)} </> : null}
                <Link
                  href={`/events/${debutSlug}`}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {detail.debut.month}月{detail.debut.day}日の記念日VTuberを見る
                </Link>
              </dd>
            </div>
          )}
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <dt className="font-bold text-zinc-900 dark:text-zinc-100">
              {detail.name}はどこの事務所？
            </dt>
            <dd className="mt-1">
              {isPersonal
                ? "個人で活動しています。"
                : `${detail.office}に所属しています。`}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
