import {
  Flower2,
  Gamepad2,
  Handshake,
  Megaphone,
  Mic,
  Newspaper,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { NewsCategory } from "@/lib/news";

type Size = "list" | "featured";

type Style = {
  bg: string;
  text: string;
  Icon: LucideIcon;
};

// Tailwind がクラス名を拾えるよう、完全なクラス名を書く（文字列の組み立て禁止）
const STYLES: Record<NewsCategory, Style> = {
  debut: {
    bg: "bg-gradient-to-br from-pink-100 to-rose-200 dark:from-rose-500/20 dark:to-rose-500/30",
    text: "text-rose-500 dark:text-rose-300",
    Icon: Sparkles,
  },
  graduation: {
    bg: "bg-gradient-to-br from-indigo-100 to-violet-200 dark:from-violet-500/20 dark:to-violet-500/30",
    text: "text-violet-500 dark:text-violet-300",
    Icon: Flower2,
  },
  notice: {
    bg: "bg-gradient-to-br from-amber-100 to-orange-200 dark:from-amber-500/20 dark:to-amber-500/30",
    text: "text-amber-500 dark:text-amber-300",
    Icon: Megaphone,
  },
  event: {
    bg: "bg-gradient-to-br from-sky-100 to-blue-200 dark:from-sky-500/20 dark:to-sky-500/30",
    text: "text-sky-500 dark:text-sky-300",
    Icon: Mic,
  },
  goods: {
    bg: "bg-gradient-to-br from-emerald-100 to-teal-200 dark:from-emerald-500/20 dark:to-emerald-500/30",
    text: "text-emerald-500 dark:text-emerald-300",
    Icon: ShoppingBag,
  },
  game: {
    bg: "bg-gradient-to-br from-violet-100 to-purple-200 dark:from-purple-500/20 dark:to-purple-500/30",
    text: "text-purple-500 dark:text-purple-300",
    Icon: Gamepad2,
  },
  collab: {
    bg: "bg-gradient-to-br from-fuchsia-100 to-pink-200 dark:from-fuchsia-500/20 dark:to-fuchsia-500/30",
    text: "text-fuchsia-500 dark:text-fuchsia-300",
    Icon: Handshake,
  },
  other: {
    bg: "bg-gradient-to-br from-zinc-100 to-slate-200 dark:from-zinc-500/20 dark:to-zinc-500/30",
    text: "text-zinc-500 dark:text-zinc-300",
    Icon: Newspaper,
  },
};

const SIZE_CLASSES: Record<Size, { box: string; label: string; icon: number }> = {
  list: { box: "h-20 w-32 rounded", label: "text-[10px]", icon: 24 },
  featured: { box: "aspect-video w-full rounded", label: "text-sm", icon: 40 },
};

/**
 * サムネが無い・読み込めないニュースの代替表示。
 * 将来マスコットのイラストを使うときは、この部品の中身だけを差し替える。
 */
export function NewsThumbFallback({
  category,
  source,
  size,
  className = "",
}: {
  category: NewsCategory;
  source: string;
  size: Size;
  className?: string;
}) {
  const style = STYLES[category];
  const sizing = SIZE_CLASSES[size];
  const Icon = style.Icon;
  return (
    <div
      aria-hidden
      className={`flex flex-col items-center justify-center gap-1 overflow-hidden ${sizing.box} ${style.bg} ${style.text} ${className}`}
    >
      <span className="rounded-full bg-white/60 p-2 dark:bg-white/10">
        <Icon size={sizing.icon} aria-hidden />
      </span>
      <span
        className={`block max-w-full line-clamp-1 px-2 font-bold ${sizing.label}`}
      >
        {source}
      </span>
    </div>
  );
}
