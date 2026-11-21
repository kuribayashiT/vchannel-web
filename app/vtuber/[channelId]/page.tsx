import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { DetailView } from "@/components/VTuberTabs";
import { formatDateSlug, todayJstParts } from "@/lib/events";
import { formatCompact, formatNumber } from "@/lib/format";
import {
  getCachedVTuberRelatedNews,
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
const jstMonthDay = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
});

const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/;

/**
 * チャンネル名から装飾を外した表示名を返す。
 * 例: `Miko Ch. さくらみこ` → `さくらみこ`、`Kuzuha Channel` → `Kuzuha`。
 * TODO: lib/vtuberName.ts に切り出して単体テストを付ける（CTR-1）。
 */
function displayVtuberName(raw: string): string {
  const original = raw.trim();
  if (!original) return raw;

  // 【】〖〗『』[] の中身を外す
  let s = original
    .replace(/[【〖『[][^】〗』\]]*[】〗』\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 「/」「Ch.」「Channel」で区切る
  const parts = s
    .split(/\s*\/\s*|\s*\bCh\.\s*|\s*\bChannel\b\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length > 0) {
    s = parts.find((p) => JAPANESE_RE.test(p)) ?? parts[0];
  }

  // 「 - 事務所名」を外す
  s = s.replace(/\s+[-–—]\s+.*$/, "").trim();
  // 末尾の hololive / にじさんじ
  s = s.replace(/\s*(hololive|ホロライブ|にじさんじ)\s*$/i, "").trim();
  // 末尾のチャンネル
  s = s.replace(/\s*(ちゃんねる|チャンネル)\s*$/, "").trim();
  // 日本語名の後ろのローマ字
  if (JAPANESE_RE.test(s)) {
    s = s.replace(/\s+[A-Za-z][A-Za-z .'\-]*$/, "").trim();
  }

  return s || original;
}

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

function parseNewsDate(value: string): Date | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const ms = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)
    ? Date.parse(normalized.replace(" ", "T") + "+09:00")
    : Date.parse(normalized);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
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

const TITLE_MAX_LENGTH = 42;

/** `{表示名}の登録者数・誕生日・デビュー日｜{事務所}`（テンプレートで ` | Vちゃんねる` が付く） */
function buildTitle(detail: VTuberDetail, shown: string): string {
  const base = `${shown}の登録者数${detail.birthday ? "・誕生日" : ""}${detail.debut ? "・デビュー日" : ""}`;
  const office = detail.office.trim();
  const officeLabel = !office || office === "個人" ? "個人勢VTuber" : office;
  const full = `${base}｜${officeLabel}`;
  return full.length > TITLE_MAX_LENGTH ? base : full;
}

/** `{表示名}（{チャンネル名}）は{事務所}所属のVTuber。YouTube登録者数…` */
function buildDescription(detail: VTuberDetail, shown: string): string {
  const parts: string[] = [];
  const office = detail.office.trim();
  const nameLabel = detail.name !== shown ? `${shown}（${detail.name}）` : shown;
  parts.push(
    !office || office === "個人"
      ? `${nameLabel}は個人勢のVTuber。`
      : `${nameLabel}は${office}所属のVTuber。`,
  );

  const items: string[] = [];
  const latestYmd = detail.transition.at(-1)?.date;
  const latestDate = latestYmd ? parseYmd(latestYmd) : null;
  items.push(
    `YouTube登録者数約${formatCompact(detail.subscriberCount)}人${latestDate ? `（${jstDate.format(latestDate)}時点）` : ""}`,
  );
  if (detail.birthday) {
    items.push(`誕生日${detail.birthday.month}月${detail.birthday.day}日`);
  }
  if (detail.debut) {
    items.push(
      `デビュー日${detail.debut.year ? `${detail.debut.year}年` : ""}${detail.debut.month}月${detail.debut.day}日`,
    );
  }
  parts.push(`${items.join("、")}。`);
  parts.push("登録者数の推移や最新動画、関連VTuberをまとめています。");
  return parts.join("");
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

  const shown = displayVtuberName(detail.name);
  const title = buildTitle(detail, shown);
  const description = buildDescription(detail, shown);
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

  const shown = displayVtuberName(detail.name);
  const channelNameDiffers = detail.name !== shown;
  const pageTitle = buildTitle(detail, shown);

  const isPersonal = detail.office === "個人";
  const [officeMembers, nearby, ranks, currentYear, relatedNews] =
    await Promise.all([
      getCachedOfficeMembers(detail.office, detail.channelId, 12),
      getCachedNearby(detail.channelId, isPersonal ? 12 : 24),
      getCachedRanks(detail.channelId),
      getCurrentJstYear(),
      getCachedVTuberRelatedNews(detail.channelId, 5).catch((error) => {
        console.error("Failed to load related news", error);
        return null;
      }),
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
        name: pageTitle,
        isPartOf: {
          "@type": "WebSite",
          "@id": `${SITE_URL}/#website`,
          name: SITE_NAME,
          url: SITE_URL,
        },
        mainEntity: {
          "@type": "Person",
          "@id": `${canonicalUrl}#person`,
          name: shown,
          ...(channelNameDiffers ? { alternateName: detail.name } : {}),
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
            name: shown,
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
        <span className="truncate text-zinc-800 dark:text-zinc-100">{shown}</span>
      </nav>

      <h1
        className={`${channelNameDiffers ? "mb-1" : "mb-2"} text-2xl font-extrabold tracking-tight`}
      >
        {shown}
      </h1>
      {channelNameDiffers && (
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          YouTube: {detail.name}
        </p>
      )}
      <p className="mb-5 text-sm leading-7 text-zinc-700 dark:text-zinc-200">
        {buildSummary({ ...detail, name: shown }, ranks)}
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

      {relatedNews && relatedNews.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-bold">関連ニュース</h2>
          <ul className="space-y-2">
            {relatedNews.map((cluster) => {
              const published = parseNewsDate(cluster.latestAt);
              return (
                <li
                  key={cluster.id}
                  className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-blue-600">{cluster.lead.source}</span>
                    {cluster.lead.tier === "official" && (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                        公式
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-start justify-between gap-3">
                    <a
                      href={cluster.lead.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                    >
                      {cluster.lead.title}
                    </a>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {published ? jstMonthDay.format(published) : ""}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3">
            <Link
              href="/news"
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              ニュース一覧へ
            </Link>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-base font-bold">よくある質問</h2>
        <dl className="space-y-2 text-sm leading-7 text-zinc-700 dark:text-zinc-200">
          {ranks && (
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <dt className="font-bold text-zinc-900 dark:text-zinc-100">
                {shown}のYouTube登録者数は？
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
                {shown}の誕生日はいつ？
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
                {shown}のデビュー日はいつ？
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
              {shown}はどこの事務所？
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
