export type SourceTier = "official" | "media" | "aggregator";

function normalizeSource(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

const SOURCE_TIER_NAMES = {
  official: [
    "prtimes",
    "prtimes.jp",
    "hololive",
    "hololiveproduction",
    "ホロライブ",
    "にじさんじ",
    "anycolor",
    "cover",
  ],
  media: [
    "panora",
    "kai-you",
    "インサイド",
    "ファミ通",
    "4gamer",
    "電撃オンライン",
    "電撃ホビーウェブ",
    "gamespark",
    "pash!plus",
    "リアルサウンド",
    "オリコンニュース",
    "モデルプレス",
    "mogulive",
    "コラボカフェ",
  ],
  aggregator: [
    "yahoo!ニュース",
    "yahooニュース",
    "infoseek",
    "dメニューニュース",
    "ニコニコニュース",
    "livedoor",
    "エキサイト",
    "gooニュース",
    "auone",
    "グノシー",
    "smartnews",
  ],
} as const;

export const NEWS_SOURCE_TIER_MAP = new Map<string, SourceTier>(
  (
    Object.entries(SOURCE_TIER_NAMES) as [SourceTier, readonly string[]][]
  ).flatMap(([tier, names]) => names.map((name) => [normalizeSource(name), tier])),
);

export const NEWS_HOST_TIER_MAP = new Map<string, SourceTier>([
  // official
  ["prtimes.jp", "official"],
  ["hololivepro.com", "official"],
  ["cover-corp.com", "official"],
  ["nijisanji.jp", "official"],
  ["anycolor.co.jp", "official"],
  // media
  ["panora.tokyo", "media"],
  ["kai-you.net", "media"],
  ["inside-games.jp", "media"],
  ["famitsu.com", "media"],
  ["4gamer.net", "media"],
  ["dengekionline.com", "media"],
  ["hobby.dengeki.com", "media"],
  ["gamespark.jp", "media"],
  ["pashplus.jp", "media"],
  ["realsound.jp", "media"],
  ["oricon.co.jp", "media"],
  ["mdpr.jp", "media"],
  ["www.moguravr.com", "media"],
  ["collabo-cafe.com", "media"],
  // aggregator
  ["news.yahoo.co.jp", "aggregator"],
  ["news.infoseek.co.jp", "aggregator"],
  ["topics.smt.docomo.ne.jp", "aggregator"],
  ["news.nicovideo.jp", "aggregator"],
  ["news.livedoor.com", "aggregator"],
  ["www.excite.co.jp", "aggregator"],
  ["news.goo.ne.jp", "aggregator"],
  ["article.auone.jp", "aggregator"],
  ["gunosy.com", "aggregator"],
  ["news.smartnews.com", "aggregator"],
]);

export const NEWS_NOISE_HOSTS = [
  "youtu.be",
  "youtube.com",
  "t.co",
  "x.com",
  "twitter.com",
  "howl.link",
] as const;

export const NEWS_NOISE_SOURCES = new Set(
  ["youtube", "howl.link"].map(normalizeSource),
);

export const VTUBER_KEYWORDS =
  /(VTuber|Vtuber|ブイチューバー|バーチャル|Vぷろ|ホロライブ|hololive|にじさんじ|NIJISANJI|ぶいすぽ|ネオポルテ|ななしいんく|774inc|どっとライブ|アップランド)/i;

export const VTUBER_MEDIA = {
  sourceNames: new Set(
    ["PANORA", "MoguLive", "Mogura VR", "MoguraVR"].map(normalizeSource),
  ),
  hostnames: ["panora.tokyo", "moguravr.com", "www.moguravr.com"] as const,
} as const;

export function normalizeNewsSourceName(value: string): string {
  return normalizeSource(value);
}

export const EXTRA_ALIASES: Record<string, string[]> = {
  "UC5CwaMl1eIgY8h02uZw7u8A": ["星街すいせい", "すいせい"],
  "UC-hM6YJuNYVAmUWxeIr9FeA": ["さくらみこ", "みこち"],
  "UC1DCedRgGHBdm81E1llLhOQ": ["兎田ぺこら", "ぺこら"],
  "UCCzUftO8KOVkV4wQG1vkUvg": ["宝鐘マリン", "マリン"],
  "UCvzGlP9oQwU--Y0r9id_jnA": ["大空スバル", "スバル"],
  "UChAnqc_AY5_I3Px5dig3X1Q": ["戌神ころね", "ころね"],
  "UCvaTdHTWBGv3MKj3KVqJVCw": ["猫又おかゆ", "おかゆ"],
};
