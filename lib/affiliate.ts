/**
 * もしもアフィリエイト（Amazon / 楽天市場）のリンク生成ユーティリティ。
 *
 * ルール:
 * - アフィリエイトリンクの URL はこのファイルの関数だけで生成する（URL の手書き禁止）。
 * - `a_id` が取得できないショップは null を返し、呼び出し側は枠を一切表示しない。
 *   （アフィリエイトなしの素のリンクにもフォールバックしない）
 * - 遷移先は商品個別ページではなく Amazon / 楽天の検索結果にする。
 */

export type AffiliateShop = "amazon" | "rakuten";

/**
 * もしも側のプログラム定数。
 * 初期値は、もしも公式の一般的な値。
 * 管理画面の「どこでもリンク」で生成した値と異なると分かった場合は、ここを書き換える。
 */
const PROGRAMS = {
  amazon: { p_id: 170, pc_id: 185, pl_id: 4062 },
  rakuten: { p_id: 54, pc_id: 54, pl_id: 616 },
} as const;

/** 楽天の a_id（公開値。HTML に出力されるため秘密情報ではない） */
const RAKUTEN_DEFAULT_AID = "5890334";

const CLICK_BASE = "https://af.moshimo.com/af/c/click";
const IMPRESSION_BASE = "https://i.moshimo.com/af/i/impression";

export const AFFILIATE_SHOPS: readonly AffiliateShop[] = ["amazon", "rakuten"];

export const AFFILIATE_SHOP_LABELS: Record<AffiliateShop, string> = {
  amazon: "Amazon",
  rakuten: "楽天市場",
};

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * ショップごとの a_id を返す。
 * NEXT_PUBLIC_* はクライアントバンドルへ静的に埋め込まれるため、
 * `process.env.NAME` の形で直接参照する（動的キー参照は不可）。
 */
function getAid(shop: AffiliateShop): string | null {
  if (shop === "rakuten") {
    return (
      clean(process.env.NEXT_PUBLIC_MOSHIMO_RAKUTEN_AID) ?? RAKUTEN_DEFAULT_AID
    );
  }
  // Amazon は未提携の間は環境変数が未設定。設定されたときだけ有効になる
  return clean(process.env.NEXT_PUBLIC_MOSHIMO_AMAZON_AID);
}

function programQuery(shop: AffiliateShop, aid: string): string {
  const p = PROGRAMS[shop];
  return (
    `a_id=${encodeURIComponent(aid)}` +
    `&p_id=${p.p_id}&pc_id=${p.pc_id}&pl_id=${p.pl_id}`
  );
}

/** ショップの検索結果ページ URL（キーワードは encodeURIComponent でエンコード） */
export function buildSearchUrl(shop: AffiliateShop, keyword: string): string {
  const kw = encodeURIComponent(keyword.trim());
  return shop === "amazon"
    ? `https://www.amazon.co.jp/s?k=${kw}`
    : `https://search.rakuten.co.jp/search/mall/${kw}/`;
}

/**
 * もしものクリック計測用リンクを生成する。
 * 対応する a_id が未設定なら null。
 */
export function buildMoshimoUrl(
  shop: AffiliateShop,
  targetUrl: string,
): string | null {
  const aid = getAid(shop);
  if (!aid) return null;
  return `${CLICK_BASE}?${programQuery(shop, aid)}&url=${encodeURIComponent(targetUrl)}`;
}

/** インプレッション計測用の 1x1 画像 URL。a_id が未設定なら null。 */
export function buildMoshimoImpressionUrl(shop: AffiliateShop): string | null {
  const aid = getAid(shop);
  if (!aid) return null;
  return `${IMPRESSION_BASE}?${programQuery(shop, aid)}`;
}

/** 楽天ウィジェットなどで使う a_id（未設定なら null） */
export function getRakutenAid(): string | null {
  return getAid("rakuten");
}

/** a_id が取得できるショップだけを返す */
export function getEnabledShops(): AffiliateShop[] {
  return AFFILIATE_SHOPS.filter((shop) => getAid(shop) !== null);
}

/** どちらか一方でも a_id があれば true */
export function isAffiliateEnabled(): boolean {
  return getEnabledShops().length > 0;
}
