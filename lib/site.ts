export const SITE_NAME = "Vちゃんねる";
export const SITE_TITLE =
  "Vちゃんねる | VTuber配信スケジュール・ランキングまとめ";
export const SITE_DESCRIPTION =
  "VTuberのリアルタイム配信スケジュール、週間ランキング、注目イベントを網羅したまとめサイト。";

/** 本番ドメインは環境変数 SITE_URL で上書きする（末尾スラッシュなし） */
export const SITE_URL = (
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/$/, "");
