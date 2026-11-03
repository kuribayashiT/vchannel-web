/**
 * FRONTEND_SPEC.md §3 のデータモデル。
 * GCS の JSON は数値が文字列で入る・キー名が揺れるため、
 * `Raw*` は生データ、無印は lib/gcs.ts で正規化した後の型。
 */

/** 数値が文字列で入ることがある値 */
export type NumLike = number | string;

/** { "YYYYMMDD": 登録者数 } */
export type SubscriberTransition = Record<string, NumLike>;

// ---------- VTuber ----------

export interface RawVTuber {
  /** YouTube チャンネル ID（綴りは原文のまま） */
  channeID?: string;
  channelId?: string;
  youtubeChId?: string;
  name: string;
  office?: string;
  officeKey?: string;
  /** true = 事務所公式アカウント（一覧で先頭） */
  officeFlg?: boolean;
  officeName?: string;
  channelThumbnail?: string;
  title?: string;
  subscriberCount?: NumLike;
  youtubeSubscriberCount?: NumLike;
  viewCount?: NumLike;
  videoCount?: NumLike;
  youtubeSubscriberCountTransition?: SubscriberTransition;
  twitterName?: string;
  twitterID?: string;
  twitterFollowerCount?: NumLike;
  twitterSubscriberCountTransition?: SubscriberTransition;
  birthday?: string;
  debut?: string;
  createdAt?: string;
  updateTime?: string;
  order?: NumLike;
}

export interface VTuber {
  channelId: string;
  name: string;
  office: string;
  officeKey: string;
  officeFlg: boolean;
  officeName: string;
  channelThumbnail: string;
  title: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  youtubeSubscriberCountTransition: Record<string, number>;
  twitterName: string;
  twitterId: string;
  twitterFollowerCount: number;
  twitterSubscriberCountTransition: Record<string, number>;
  birthday: string;
  debut: string;
  createdAt: string;
  updateTime: string;
  order: number;
}

/** officedataList.json: { "<事務所名>": VTuber[] } */
export type RawOfficeDataList = Record<string, RawVTuber[]>;
export type OfficeDataList = Record<string, VTuber[]>;

// ---------- Video ----------

export interface RawVideo {
  videoID?: string;
  /** 旧表記 */
  videoId?: string;
  title: string;
  channelId?: string;
  channelTitle?: string;
  channelThumbnail?: string;
  thumbnail?: string;
  office?: string;
  officeKey?: string;
  concurrent_viewers?: NumLike;
  scheduledStartTime?: string;
  actualStartTime?: string;
  /** 未終了は "" */
  actualEndTime?: string;
  /** ISO8601 UTC。日付振り分けの基準時刻 */
  comparisonDay?: string;
  publishedAt?: string;
}

export interface Video {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  thumbnail: string;
  office: string;
  officeKey: string;
  concurrentViewers: number;
  scheduledStartTime: string;
  actualStartTime: string;
  actualEndTime: string;
  comparisonDay: string;
  publishedAt: string;
}

// ---------- VTuber（API 返却用） ----------

export interface VTuberIndexItem {
  channelId: string;
  name: string;
  office: string;
  officeFlg: boolean;
  thumbnail: string;
  subscriberCount: number;
}

export interface VTuberDetail extends VTuberIndexItem {
  title: string;
  viewCount: number;
  videoCount: number;
  /** 直近 30 日（古い順） */
  transition: { date: string; count: number }[];
  /** 新しい順・最大 30 件 */
  videos: Video[];
}

// ---------- News ----------

export interface News {
  /** 媒体名。空 / "YouTube" など。未設定時は「ブログ記事」表示 */
  channel: string;
  title: string;
  /** YYYY-MM-DD HH:mm:ss */
  publishedAt: string;
  description: string;
  url: string;
  urlToImage: string;
  sourceName: string;
  sourceUrl: string;
  creator: string;
  /** 解説動画の YouTube URL（任意） */
  videoUrl?: string;
}

// ---------- Event ----------

export type EventType = "createAt" | "birthday";

export interface VEvent {
  eventType: EventType;
  channelId: string;
  channelThumbnail: string;
  name: string;
  office: string;
  /** YYYY/MM/DD */
  createdAt: string;
}

/** eventList.json: [ { "<M/D>": VEvent[] }, ... ] */
export type EventList = Record<string, VEvent[]>[];

// ---------- Ranking ----------

interface RankingBase {
  channelId: string;
  name: string;
  office: string;
  channelThumbnail: string;
}

export interface YoutubeSubscriberRankingItem extends RankingBase {
  youtubeSubscriberCount: number;
}

export interface TwitterFollowerRankingItem extends RankingBase {
  twitterFollowerCount: number;
}

/** 実データは動画オブジェクト（concurrent_viewers 付き） */
export type WeeklyLiveViewRankingItem = Video;

export interface VideoCountRankingItem extends RankingBase {
  videoCount: number;
}

// ---------- 登録者推移・急上昇 ----------

/** youtubeSubscriberCountTransitionList.json の生データ */
export type RawSubscriberTransitionList = Record<
  string,
  Record<string, NumLike>[]
>[];

/** 正規化後: channelId → 日付昇順の推移 */
export type SubscriberTransitionMap = Record<
  string,
  { date: string; count: number }[]
>;

export type GrowthPeriod = "week" | "month";

/** サーバーで集計してクライアントに渡す 1 行（props を軽くするため最小限） */
export interface SubscriberGrowthItem {
  channelId: string;
  name: string;
  office: string;
  thumbnail: string;
  /** 期間末の登録者数 */
  current: number;
  /** 期間内の増加数（> 0 のみ） */
  growth: number;
  /** 増加率（%） */
  rate: number;
  /** ミニグラフ用: 期間内の登録者数（日付昇順） */
  spark: number[];
}

export interface SubscriberGrowthPeriodData {
  /** YYYYMMDD */
  from: string;
  to: string;
  items: SubscriberGrowthItem[];
}

export type SubscriberGrowthData = Record<
  GrowthPeriod,
  SubscriberGrowthPeriodData
>;

// ---------- GCS ファイル名 ----------

export const GCS_FILES = {
  officeData: "officedataList.json",
  liveVideos: "livevideoList.json",
  allVideos: "allvideos.json",
  news: "news.json",
  events: "eventList.json",
  rankingYoutube: "rankingYoutubeRegiData.json",
  subscriberTransition: "youtubeSubscriberCountTransitionList.json",
  rankingTwitter: "rankingTwitterData.json",
  weeklyLiveView: "weeklyLiveViewRanking.json",
  rankingVideoCount: "rankingVideoCountData.json",
} as const;

export type GcsFileName = (typeof GCS_FILES)[keyof typeof GCS_FILES];
