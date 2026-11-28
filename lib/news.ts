import { safeHttpUrl } from "@/lib/url";
import {
  EXTRA_ALIASES,
  NEWS_HOST_TIER_MAP,
  NEWS_NOISE_HOSTS,
  NEWS_NOISE_SOURCES,
  NEWS_SOURCE_TIER_MAP,
  VTUBER_KEYWORDS,
  VTUBER_MEDIA,
  normalizeNewsSourceName,
  type SourceTier,
} from "@/lib/news-sources";
import type { News, VTuberIndexItem } from "@/types";

export type NewsTier = SourceTier | "other";

export type NewsCategory =
  | "graduation"
  | "debut"
  | "notice"
  | "event"
  | "goods"
  | "game"
  | "collab"
  | "other";

export type VTuberRef = {
  channelId: string;
  name: string;
  thumbnail: string;
};

export type NewsItemView = {
  id: string;
  title: string;
  url: string;
  source: string;
  tier: NewsTier;
  imageSrc: string | null;
  publishedAt: string;
  videoUrl?: string;
};

export type NewsCluster = {
  id: string;
  lead: NewsItemView;
  others: NewsItemView[];
  sourceCount: number;
  category: NewsCategory;
  vtubers: VTuberRef[];
  /** 代表記事の画像、無ければ others で最初に画像がある記事の画像、どれも無ければ null */
  imageSrc: string | null;
  latestAt: string;
  score: number;
  clicks: number;
};

export type NewsSourceScores = Record<
  string,
  { adCount: number; sampled: number; checkedAt: string }
>;

const TIER_PRIORITY: Record<NewsTier, number> = {
  official: 0,
  media: 1,
  other: 2,
  aggregator: 3,
};

const TIER_SCORE: Record<NewsTier, number> = {
  official: 2,
  media: 1,
  other: 0,
  aggregator: 0,
};

const CATEGORY_RULES: Array<[NewsCategory, RegExp]> = [
  [
    "graduation",
    /(卒業|引退|契約解除|活動終了|活動休止|休止)/i,
  ],
  ["debut", /(デビュー|初配信|新人|オーディション)/i],
  [
    "notice",
    /(お知らせ|謝罪|注意喚起|漏えい|漏洩|不正アクセス|声明|法的措置)/i,
  ],
  [
    "event",
    /(ライブ|フェス|イベント|コンサート|展示|ポップアップ|カフェ|ビューイング|開催)/i,
  ],
  ["goods", /(グッズ|フィギュア|ぬいぐるみ|プライズ|ガシャポン|予約|発売|受注|スタンプ)/i],
  ["game", /(ゲーム|steam|アプリ)/i],
  ["collab", /(コラボ|タイアップ|出演|起用|アンバサダー)/i],
];

const STOP_WORDS = [
  "にじさんじ",
  "ホロライブ",
  "hololive",
  "nijisanji",
  "vtuber",
  "グッズ",
  "登場",
  "発売",
  "販売開始",
  "販売",
  "開催",
  "決定",
  "から",
  "公式",
  "記念",
  "配信",
  "開始",
] as const;

const ALIAS_BLOCK_LIST = new Set(
  [
    "にじさんじ",
    "ホロライブ",
    "切り抜き",
    "所属",
    "official",
    "channel",
    "ch",
    "マスター",
  ].map((x) => normalizeMatchText(x)),
);

const DISPLAY_SOURCE_FALLBACK = "ブログ記事";

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  graduation: "卒業・休止",
  debut: "デビュー",
  notice: "お知らせ",
  event: "ライブ・イベント",
  goods: "グッズ",
  game: "ゲーム",
  collab: "コラボ・出演",
  other: "その他",
};

function parsePublishedAtMs(publishedAt: string): number {
  const normalized = publishedAt.trim();
  if (!normalized) return Number.NaN;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return Date.parse(normalized.replace(" ", "T") + "+09:00");
  }
  return Date.parse(normalized);
}

function hostMatches(hostname: string, candidate: string): boolean {
  return hostname === candidate || hostname.endsWith(`.${candidate}`);
}

function sourceNameFromNews(news: News): string {
  const source = news.channel.trim();
  return source || DISPLAY_SOURCE_FALLBACK;
}

function isVtuberMediaNews(news: News): boolean {
  const normalizedSource = normalizeNewsSourceName(sourceNameFromNews(news));
  if (VTUBER_MEDIA.sourceNames.has(normalizedSource)) return true;
  const safeUrl = safeHttpUrl(news.url);
  if (!safeUrl) return false;
  const host = new URL(safeUrl).hostname.toLowerCase();
  return VTUBER_MEDIA.hostnames.some((baseHost) => hostMatches(host, baseHost));
}

function matchesVtuberAlias(title: string, aliases: Map<string, VTuberRef>): boolean {
  const normalizedTitle = normalizeMatchText(title);
  if (!normalizedTitle) return false;
  for (const alias of aliases.keys()) {
    if (normalizedTitle.includes(alias)) return true;
  }
  return false;
}

function isRelevantGoogleNews(news: News, aliases: Map<string, VTuberRef>): boolean {
  if (news.origin !== "gnews") return true;
  return (
    VTUBER_KEYWORDS.test(news.title) ||
    matchesVtuberAlias(news.title, aliases) ||
    isVtuberMediaNews(news)
  );
}

function cleanTitle(title: string): string {
  return title.normalize("NFKC");
}

function normalizeMatchText(value: string): string {
  return value.normalize("NFKC").replace(/[\s　]/g, "").toLowerCase();
}

function isLikelyOfficialByName(source: string): boolean {
  return /(株式会社|合同会社|公式|自治体)/.test(source);
}

function removeDateAndTime(text: string): string {
  return text
    .replace(/\d{4}年/g, " ")
    .replace(/\d{1,2}月\d{1,2}日/g, " ")
    .replace(/[（(][月火水木金土日][）)]/g, " ")
    .replace(/\d{1,2}時(?:\d{1,2}分)?/g, " ")
    .replace(/\d{1,2}:\d{2}/g, " ");
}

function removeSourceSuffix(text: string): string {
  return text
    .replace(/\s*[|｜]\s*[^|｜]+$/, " ")
    .replace(/\s*[（(][^（）()]*[）)]\s*$/, " ");
}

function tokenSetFromTitle(title: string): Set<string> {
  const normalized = normalizeTitleForCluster(title);
  return titleBigrams(normalized);
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const small = a.size <= b.size ? a : b;
  const large = a.size <= b.size ? b : a;
  let overlap = 0;
  for (const token of small) {
    if (large.has(token)) overlap += 1;
  }
  return overlap / small.size;
}

function toNewsItemView(news: News): NewsItemView {
  const url = safeHttpUrl(news.url) ?? news.url;
  const imageSrc =
    news.urlToImage && safeHttpUrl(news.urlToImage)
      ? `/api/news-image?u=${encodeURIComponent(news.urlToImage)}`
      : null;
  const videoUrl = safeHttpUrl(news.videoUrl ?? "");
  return {
    id: newsId(url),
    title: cleanTitle(news.title),
    url,
    source: sourceNameFromNews(news),
    tier: getNewsTier(news),
    imageSrc,
    publishedAt: news.publishedAt,
    ...(videoUrl ? { videoUrl } : {}),
  };
}

function compareByRepresentative(a: NewsItemView, b: NewsItemView): number {
  const tierDiff = TIER_PRIORITY[a.tier] - TIER_PRIORITY[b.tier];
  if (tierDiff !== 0) return tierDiff;
  const at = parsePublishedAtMs(a.publishedAt);
  const bt = parsePublishedAtMs(b.publishedAt);
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) {
    return at - bt;
  }
  return a.title.localeCompare(b.title, "ja");
}

function extractAliasesFromName(name: string): string[] {
  const stripped = name
    .normalize("NFKC")
    .replace(/[【】《》\[\]（）()]/g, " ")
    .replace(/\bch[.。]?\b/gi, " ")
    .replace(/\bchannel\b/gi, " ")
    .replace(/\bofficial\b/gi, " ")
    .replace(/チャンネル|ちゃんねる|公式|所属/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = stripped
    .split(/[\/|\-_:、!,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const candidates = new Set<string>();
  if (stripped.length >= 3 && /[\u3040-\u30ff\u3400-\u9fff]/.test(stripped)) {
    candidates.add(stripped);
  }
  for (const token of parts) {
    if (token.length < 3) continue;
    if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(token)) continue;
    candidates.add(token);
  }
  return [...candidates];
}

function normalizeAliasKey(alias: string): string {
  return normalizeMatchText(alias);
}

function extractClusterVtubers(
  entries: NewsItemView[],
  aliases: Map<string, VTuberRef>,
): VTuberRef[] {
  const titleTexts = entries.map((entry) => normalizeMatchText(entry.title));
  const found: VTuberRef[] = [];
  const used = new Set<string>();
  for (const [alias, ref] of aliases.entries()) {
    if (used.has(ref.channelId)) continue;
    if (titleTexts.some((title) => title.includes(alias))) {
      found.push(ref);
      used.add(ref.channelId);
    }
    if (found.length >= 3) break;
  }
  return found;
}

export function newsId(url: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i += 1) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function getNewsTier(news: News): NewsTier {
  const safeUrl = safeHttpUrl(news.url);
  if (safeUrl) {
    const host = new URL(safeUrl).hostname.toLowerCase();
    for (const [base, tier] of NEWS_HOST_TIER_MAP.entries()) {
      if (hostMatches(host, base)) return tier;
    }
  }
  const sourceName = sourceNameFromNews(news);
  if (isLikelyOfficialByName(sourceName)) return "official";
  const byName = NEWS_SOURCE_TIER_MAP.get(normalizeNewsSourceName(sourceName));
  return byName ?? "other";
}

export function isNoiseNews(
  news: News,
  now: number,
  maxAgeDays = 14,
): boolean {
  const title = news.title.trim();
  if (!title) return true;

  const safeUrl = safeHttpUrl(news.url);
  if (!safeUrl) return true;

  const host = new URL(safeUrl).hostname.toLowerCase();
  if (NEWS_NOISE_HOSTS.some((noiseHost) => hostMatches(host, noiseHost))) {
    return true;
  }

  if (NEWS_NOISE_SOURCES.has(normalizeNewsSourceName(news.channel))) {
    return true;
  }

  const published = parsePublishedAtMs(news.publishedAt);
  if (!Number.isFinite(published)) return true;
  const maxAgeMs = maxAgeDays * 86_400_000;
  return now - published > maxAgeMs;
}

export function normalizeTitleForCluster(title: string): string {
  let normalized = cleanTitle(title);
  normalized = removeSourceSuffix(normalized);
  normalized = removeDateAndTime(normalized);
  for (const word of STOP_WORDS) {
    normalized = normalized.replace(new RegExp(word, "gi"), " ");
  }
  return normalized.replace(/[\p{P}\p{S}\s]+/gu, "").toLowerCase();
}

export function titleBigrams(title: string): Set<string> {
  const normalized = normalizeTitleForCluster(title);
  const out = new Set<string>();
  for (let i = 0; i + 1 < normalized.length; i += 1) {
    out.add(normalized.slice(i, i + 2));
  }
  return out;
}

export function categorizeNews(title: string): NewsCategory {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(title)) return category;
  }
  return "other";
}

export function buildVTuberAliasIndex(
  index: VTuberIndexItem[],
): Map<string, VTuberRef> {
  const aliases = new Map<string, VTuberRef | null>();
  for (const item of index) {
    if (item.officeFlg) continue;
    const ref: VTuberRef = {
      channelId: item.channelId,
      name: item.name,
      thumbnail: item.thumbnail,
    };
    const names = new Set<string>(extractAliasesFromName(item.name));
    for (const extra of EXTRA_ALIASES[item.channelId] ?? []) {
      names.add(extra);
    }
    for (const alias of names) {
      const key = normalizeAliasKey(alias);
      if (key.length < 3 || ALIAS_BLOCK_LIST.has(key)) continue;
      const existing = aliases.get(key);
      if (existing === undefined) {
        aliases.set(key, ref);
        continue;
      }
      if (existing && existing.channelId !== ref.channelId) aliases.set(key, null);
    }
  }
  return new Map(
    [...aliases.entries()].flatMap(([alias, ref]) => (ref ? [[alias, ref]] : [])),
  );
}

export function clusterNews(
  items: News[],
  opts: {
    now: number;
    aliases: Map<string, VTuberRef>;
    clicks?: Record<string, number>;
    sourceScores?: NewsSourceScores;
    maxAgeDays?: number;
  },
): NewsCluster[] {
  const filtered = items
    .filter((item) => !isNoiseNews(item, opts.now, opts.maxAgeDays))
    .filter((item) => isRelevantGoogleNews(item, opts.aliases))
    .map((item) => ({
      raw: item,
      view: toNewsItemView(item),
      publishedMs: parsePublishedAtMs(item.publishedAt),
      tokens: tokenSetFromTitle(item.title),
    }))
    .sort((a, b) => {
      if (Number.isFinite(a.publishedMs) && Number.isFinite(b.publishedMs)) {
        return b.publishedMs - a.publishedMs;
      }
      return b.view.publishedAt.localeCompare(a.view.publishedAt);
    });

  type WorkCluster = {
    entries: typeof filtered;
    leadIndex: number;
    leadTokens: Set<string>;
  };

  const clusters: WorkCluster[] = [];
  for (const item of filtered) {
    const matched = clusters.find(
      (cluster) => similarity(item.tokens, cluster.leadTokens) >= 0.5,
    );
    if (!matched) {
      clusters.push({ entries: [item], leadIndex: 0, leadTokens: item.tokens });
      continue;
    }
    matched.entries.push(item);
    let bestIndex = matched.leadIndex;
    for (let i = 0; i < matched.entries.length; i += 1) {
      const candidate = matched.entries[i]?.view;
      const current = matched.entries[bestIndex]?.view;
      if (candidate && current && compareByRepresentative(candidate, current) < 0) {
        bestIndex = i;
      }
    }
    matched.leadIndex = bestIndex;
    matched.leadTokens = matched.entries[bestIndex]?.tokens ?? matched.leadTokens;
  }

  const clicks = opts.clicks ?? {};
  const sourceScores = opts.sourceScores ?? {};
  return clusters
    .map((cluster) => {
      const lead = cluster.entries[cluster.leadIndex]?.view;
      if (!lead) return null;
      const allViews = cluster.entries.map((entry) => entry.view);
      const others = allViews.filter((item) => item.id !== lead.id);
      const imageSrc =
        lead.imageSrc ?? others.find((item) => item.imageSrc)?.imageSrc ?? null;
      const sourceCount = new Set(allViews.map((item) => item.source)).size;
      const latestMs = Math.max(
        ...cluster.entries.map((entry) =>
          Number.isFinite(entry.publishedMs) ? entry.publishedMs : 0,
        ),
      );
      const latestAt =
        cluster.entries.find((entry) => entry.publishedMs === latestMs)?.view
          .publishedAt ?? lead.publishedAt;
      const clusterClicks = allViews.reduce(
        (sum, item) => sum + (clicks[item.id] ?? 0),
        0,
      );
      const elapsedHours = Number.isFinite(latestMs)
        ? Math.max(0, (opts.now - latestMs) / 3_600_000)
        : 0;
      let sourceScoreAdjustment = 0;
      const leadHost = (() => {
        const safe = safeHttpUrl(lead.url);
        if (!safe) return "";
        try {
          return new URL(safe).hostname.toLowerCase();
        } catch {
          return "";
        }
      })();
      if (leadHost) {
        const adCount = sourceScores[leadHost]?.adCount;
        if (typeof adCount === "number") {
          if (adCount >= 20) sourceScoreAdjustment = -2;
          else if (adCount <= 5) sourceScoreAdjustment = 1;
        }
      }
      const score =
        (sourceCount - 1) * 3 +
        TIER_SCORE[lead.tier] +
        Math.min(clusterClicks, 50) / 5 -
        elapsedHours / 12 +
        sourceScoreAdjustment;
      return {
        id: lead.id,
        lead,
        others,
        sourceCount,
        category: categorizeNews(lead.title),
        vtubers: extractClusterVtubers(allViews, opts.aliases),
        imageSrc,
        latestAt,
        score,
        clicks: clusterClicks,
      } satisfies NewsCluster;
    })
    .filter((cluster): cluster is NewsCluster => Boolean(cluster))
    .sort((a, b) => parsePublishedAtMs(b.latestAt) - parsePublishedAtMs(a.latestAt));
}
