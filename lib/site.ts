export const SITE_NAME = "Vちゃんねる";
export const SITE_TITLE = "Vちゃんねる｜VTuberの配信スケジュール・ニュース・ランキング";
export const SITE_DESCRIPTION =
  "VTuberの配信スケジュール・ニュース・ランキング・イベント情報をまとめて確認できるサイトです。";

/** 本番の正式ドメイン（www あり）。URL の直書きはここだけ。 */
const PRODUCTION_SITE_URL = "https://www.vchannel.net";

function withProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function resolveSiteUrl(): string {
  const fromEnv = process.env.SITE_URL?.trim();
  if (fromEnv) return withProtocol(fromEnv);

  if (process.env.VERCEL_ENV === "production") return PRODUCTION_SITE_URL;

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) return withProtocol(productionHost);

  return "http://localhost:3000";
}

/** canonical・sitemap・OGP・JSON-LD の基準 URL（末尾スラッシュなし） */
export const SITE_URL = resolveSiteUrl().replace(/\/+$/, "");
