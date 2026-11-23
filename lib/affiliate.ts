/**
 * アフィリエイトリンク生成ユーティリティ。
 *
 * - グッズ検索リンク（AffiliateLinks）は、もしもアフィリエイトの「どこでもリンク」経由で作る
 *   （buildMoshimoRakutenUrl）。
 * - 楽天モーションウィジェットは、楽天アフィリエイトの ID を使って楽天に直接つなぐ
 *   （getRakutenAffiliateId）。
 *
 * ルール:
 * - アフィリエイトリンクの URL はこのファイルの関数だけで生成する（URL の手書き禁止）。
 * - アフィリエイト ID がない場合は枠を一切表示しない。
 *   （アフィリエイトなしの素のリンクにもフォールバックしない）
 * - 遷移先は商品個別ページではなく楽天市場の検索結果にする。
 */

const RAKUTEN_AFFILIATE_BASE = "https://hb.afl.rakuten.co.jp/hgc";
const RAKUTEN_AFFILIATE_ID = "5964c172.78b60cce.5964c173.d6c6def5";

/** もしもアフィリエイトのアカウント ID（リンクに公開される値で、秘密情報ではない） */
export const MOSHIMO_A_ID = "5893757";

/** もしも経由の楽天市場（どこでもリンク）の提携情報（公開される値） */
export const MOSHIMO_RAKUTEN = { pId: "54", pcId: "54", plId: "27059" } as const;

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function getRakutenAffiliateId(): string | null {
  return clean(process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID) ?? RAKUTEN_AFFILIATE_ID;
}

/**
 * 楽天アフィリエイト（直接）のリンクを作る。
 *
 * グッズ検索リンクには使わない（もしも経由の `buildMoshimoRakutenUrl` を使う）。
 */
export function buildRakutenAffiliateUrl(targetUrl: string): string | null {
  const id = getRakutenAffiliateId();
  if (!id) return null;
  return `${RAKUTEN_AFFILIATE_BASE}/${id}/?pc=${encodeURIComponent(targetUrl)}&link_type=text`;
}

/**
 * もしもアフィリエイト「どこでもリンク」経由の楽天市場リンクを作る。
 * targetUrl は楽天市場の遷移先 URL（例: buildSearchUrl の結果）。
 */
export function buildMoshimoRakutenUrl(targetUrl: string): string {
  return `https://af.moshimo.com/af/c/click?a_id=${MOSHIMO_A_ID}&p_id=${MOSHIMO_RAKUTEN.pId}&pc_id=${MOSHIMO_RAKUTEN.pcId}&pl_id=${MOSHIMO_RAKUTEN.plId}&url=${encodeURIComponent(targetUrl)}`;
}

/** 楽天の検索結果ページ URL（キーワードは encodeURIComponent でエンコード） */
export function buildSearchUrl(keyword: string): string {
  const kw = encodeURIComponent(keyword.trim());
  return `https://search.rakuten.co.jp/search/mall/${kw}/`;
}

/** 楽天 ID があれば true */
export function isAffiliateEnabled(): boolean {
  return getRakutenAffiliateId() !== null;
}
