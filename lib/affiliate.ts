/**
 * 楽天アフィリエイト（直接）のリンク生成ユーティリティ。
 *
 * ルール:
 * - アフィリエイトリンクの URL はこのファイルの関数だけで生成する（URL の手書き禁止）。
 * - アフィリエイト ID がない場合は null を返し、呼び出し側は枠を一切表示しない。
 *   （アフィリエイトなしの素のリンクにもフォールバックしない）
 * - 遷移先は商品個別ページではなく楽天市場の検索結果にする。
 */

const RAKUTEN_AFFILIATE_BASE = "https://hb.afl.rakuten.co.jp/hgc";
const RAKUTEN_AFFILIATE_ID = "5964c172.78b60cce.5964c173.d6c6def5";

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function getRakutenAffiliateId(): string | null {
  return clean(process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID) ?? RAKUTEN_AFFILIATE_ID;
}

export function buildRakutenAffiliateUrl(targetUrl: string): string | null {
  const id = getRakutenAffiliateId();
  if (!id) return null;
  return `${RAKUTEN_AFFILIATE_BASE}/${id}/?pc=${encodeURIComponent(targetUrl)}&link_type=text`;
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
