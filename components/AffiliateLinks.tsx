import { ShoppingBag } from "lucide-react";
import {
  buildRakutenAffiliateUrl,
  buildSearchUrl,
  isAffiliateEnabled,
} from "@/lib/affiliate";

type AffiliateLinksProps = {
  keyword: string;
  heading?: string;
};

export function AffiliateLinks({
  keyword,
  heading = "関連グッズ・CDを探す",
}: AffiliateLinksProps) {
  const kw = keyword.trim();
  if (!kw || !isAffiliateEnabled()) return null;

  const searchUrl = buildSearchUrl(kw);
  const href = buildRakutenAffiliateUrl(searchUrl);
  if (!href) return null;

  return (
    <section
      aria-label="アフィリエイトリンク"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{heading}</h3>
        <span className="rounded bg-pink-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-pink-700">
          PR
        </span>
      </div>
      <a
        href={href}
        target="_blank"
        rel="nofollow sponsored noopener"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#bf0000] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
      >
        <ShoppingBag size={16} />
        楽天市場で探す
      </a>
    </section>
  );
}
