/**
 * ランキング画面の表示状態（タブ・期間）と URL クエリの相互変換。
 * 純関数のみで構成し、サーバー（generateMetadata）・クライアント両方から使う。
 *
 * 履歴の方針: タブ・期間の切替はいずれも router.replace で URL を更新する（履歴を汚さない）。
 */

export const RANKING_QUERY_TABS = [
  "live",
  "subscribers",
  "videos",
  "growth",
] as const;

export const RANKING_QUERY_PERIODS = ["week", "month"] as const;

export type RankingQueryTab = (typeof RANKING_QUERY_TABS)[number];
export type RankingQueryPeriod = (typeof RANKING_QUERY_PERIODS)[number];

export interface RankingViewState {
  tab: RankingQueryTab;
  /** growth タブのときのみ意味を持つ。それ以外は常に既定値 */
  period: RankingQueryPeriod;
}

export const DEFAULT_RANKING_TAB: RankingQueryTab = "live";
export const DEFAULT_RANKING_PERIOD: RankingQueryPeriod = "week";

interface SearchParamsLike {
  get(name: string): string | null;
}

export type SearchParamsInput =
  | SearchParamsLike
  | Record<string, string | string[] | undefined>;

function hasGet(sp: SearchParamsInput): sp is SearchParamsLike {
  return typeof (sp as Partial<SearchParamsLike>).get === "function";
}

function readParam(sp: SearchParamsInput, name: string): string | undefined {
  if (hasGet(sp)) return sp.get(name) ?? undefined;
  const v = sp[name];
  return Array.isArray(v) ? v[0] : v;
}

function isTab(v: string | undefined): v is RankingQueryTab {
  return RANKING_QUERY_TABS.some((t) => t === v);
}

function isPeriod(v: string | undefined): v is RankingQueryPeriod {
  return RANKING_QUERY_PERIODS.some((p) => p === v);
}

/** クエリ文字列 → 表示状態。不正値・未指定は既定値にフォールバックする */
export function parseRankingQuery(sp: SearchParamsInput): RankingViewState {
  const rawTab = readParam(sp, "tab");
  const rawPeriod = readParam(sp, "period");
  const tab = isTab(rawTab) ? rawTab : DEFAULT_RANKING_TAB;
  const period =
    tab === "growth" && isPeriod(rawPeriod) ? rawPeriod : DEFAULT_RANKING_PERIOD;
  return { tab, period };
}

/** 表示状態 → クエリ文字列（先頭の ? なし）。既定値と同じ値は含めない */
export function buildRankingQuery(state: RankingViewState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULT_RANKING_TAB) params.set("tab", state.tab);
  if (state.tab === "growth" && state.period !== DEFAULT_RANKING_PERIOD) {
    params.set("period", state.period);
  }
  return params.toString();
}

const TAB_TITLES: Record<RankingQueryTab, string> = {
  live: "週間同時視聴者数ランキング",
  subscribers: "YouTube登録者数ランキング",
  videos: "動画本数ランキング",
  growth: "登録者急上昇ランキング",
};

const TAB_DESCRIPTIONS: Record<RankingQueryTab, string> = {
  live: "VTuberの週間同時視聴者数ランキング。直近1週間でたくさん見られた配信をチェック。",
  subscribers: "VTuberのYouTubeチャンネル登録者数ランキング。",
  videos: "VTuberのYouTube動画本数ランキング。",
  growth: "VTuberのYouTubeチャンネル登録者の増加数・増加率ランキング。急上昇中のVTuberがわかります。",
};

const PERIOD_LABELS: Record<RankingQueryPeriod, string> = {
  week: "週間",
  month: "月間",
};

/** メタデータ用のタイトル・説明（サイト名サフィックスは layout の template が付与） */
export function rankingMeta(state: RankingViewState): {
  title: string;
  description: string;
} {
  const isDefault = buildRankingQuery(state) === "";
  if (isDefault) {
    return {
      title: "ランキング",
      description:
        "VTuberの週間同時視聴者数・YouTube登録者数・動画本数・登録者急上昇のランキング。",
    };
  }
  const base = TAB_TITLES[state.tab];
  if (state.tab === "growth") {
    const label = PERIOD_LABELS[state.period];
    return {
      title: `${base}（${label}）`,
      description: `${TAB_DESCRIPTIONS.growth}（${label}）`,
    };
  }
  return { title: base, description: TAB_DESCRIPTIONS[state.tab] };
}
