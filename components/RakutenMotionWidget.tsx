import { getRakutenAffiliateId, isAffiliateEnabled } from "@/lib/affiliate";

const MOBILE_SIZE = { width: 300, height: 250 };
const DESKTOP_SIZE = { width: 600, height: 200 };
const RAKUTEN_WIDGET_SCRIPT =
  "https://xml.affiliate.rakuten.co.jp/widget/js/rakuten_widget.js?20230106";
const RAKUTEN_WIDGET_FIXED_OPTIONS = {
  design: "slide",
  items: "ctsmatch",
  genreId: "0",
  target: "_blank",
  theme: "gray",
  border: "off",
  autoMode: "on",
  genreTitle: "off",
  recommend: "on",
  ts: "1794402335560",
} as const;

function buildSrcDoc(width: number, height: number): string | null {
  const affiliateId = getRakutenAffiliateId();
  if (!affiliateId) return null;
  const size = `${width}x${height}`;
  const widgetParam = `rakuten_design="${RAKUTEN_WIDGET_FIXED_OPTIONS.design}";rakuten_affiliateId="${affiliateId}";rakuten_items="${RAKUTEN_WIDGET_FIXED_OPTIONS.items}";rakuten_genreId="${RAKUTEN_WIDGET_FIXED_OPTIONS.genreId}";rakuten_size="${size}";rakuten_target="${RAKUTEN_WIDGET_FIXED_OPTIONS.target}";rakuten_theme="${RAKUTEN_WIDGET_FIXED_OPTIONS.theme}";rakuten_border="${RAKUTEN_WIDGET_FIXED_OPTIONS.border}";rakuten_auto_mode="${RAKUTEN_WIDGET_FIXED_OPTIONS.autoMode}";rakuten_genre_title="${RAKUTEN_WIDGET_FIXED_OPTIONS.genreTitle}";rakuten_recommend="${RAKUTEN_WIDGET_FIXED_OPTIONS.recommend}";rakuten_ts="${RAKUTEN_WIDGET_FIXED_OPTIONS.ts}";`;
  return [
    "<!doctype html>",
    "<html><head><meta charset=\"utf-8\">",
    "<base target=\"_blank\">",
    "<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style>",
    "</head><body>",
    `<script type="text/javascript">${widgetParam}</script>`,
    `<script type="text/javascript" src="${RAKUTEN_WIDGET_SCRIPT}"></script>`,
    "</body></html>",
  ].join("");
}

export function RakutenMotionWidget() {
  if (!isAffiliateEnabled()) return null;
  const mobileSrcDoc = buildSrcDoc(MOBILE_SIZE.width, MOBILE_SIZE.height);
  const desktopSrcDoc = buildSrcDoc(DESKTOP_SIZE.width, DESKTOP_SIZE.height);
  if (!mobileSrcDoc || !desktopSrcDoc) return null;

  return (
    <section
      aria-label="楽天市場のおすすめ商品（広告）"
      className="mt-8 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          楽天市場のおすすめ
        </h2>
        <span className="rounded bg-pink-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-pink-700">
          PR
        </span>
      </div>

      <div className="flex justify-center sm:hidden">
        <iframe
          title="楽天市場のおすすめ商品（広告）"
          srcDoc={mobileSrcDoc}
          width={MOBILE_SIZE.width}
          height={MOBILE_SIZE.height}
          loading="lazy"
          scrolling="no"
          style={{ border: 0 }}
        />
      </div>
      <div className="hidden justify-center sm:flex">
        <iframe
          title="楽天市場のおすすめ商品（広告）"
          srcDoc={desktopSrcDoc}
          width={DESKTOP_SIZE.width}
          height={DESKTOP_SIZE.height}
          loading="lazy"
          scrolling="no"
          style={{ border: 0 }}
        />
      </div>
    </section>
  );
}
