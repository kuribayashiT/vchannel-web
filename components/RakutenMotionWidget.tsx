import {
  buildRakutenAffiliateUrl,
  isAffiliateEnabled,
} from "@/lib/affiliate";

const MOBILE_SIZE = { width: 300, height: 250 };
const DESKTOP_SIZE = { width: 600, height: 200 };

function buildSrcDoc(width: number, height: number): string | null {
  const href = buildRakutenAffiliateUrl("https://www.rakuten.co.jp/");
  if (!href) return null;
  return [
    "<!doctype html>",
    "<html><head><meta charset=\"utf-8\">",
    "<base target=\"_blank\">",
    "<style>",
    "html,body{margin:0;padding:0;overflow:hidden;background:#fff}",
    `body{width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}`,
    "a{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2563eb;text-decoration:underline;word-break:break-word;font-size:13px;line-height:1.5}",
    "</style></head><body>",
    `<a href="${href}" rel="nofollow sponsored noopener">楽天市場のおすすめ商品を見る</a>`,
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
