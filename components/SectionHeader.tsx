import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

type HeadingLevel = "h1" | "h2" | "h3";

type Props = {
  /** 見出しテキスト */
  title: string;
  /** 見出しの HTML レベル。ページ主見出しは h1、セクションは h2、小見出しは h3 */
  as?: HeadingLevel;
  /** タイトル左に表示する lucide-react のアイコン */
  icon?: LucideIcon;
  /** 見出し下の補足説明（指標の定義・集計期間など） */
  description?: string;
  /** 右側の導線リンク（例: もっと見る） */
  action?: { href: string; label: string };
  /** aria-labelledby 等で参照するための見出し要素の id */
  id?: string;
  /** 外側ラッパーへの追加クラス（余白調整用） */
  className?: string;
};

const SIZE: Record<HeadingLevel, string> = {
  h1: "text-2xl font-extrabold tracking-tight",
  h2: "text-lg font-bold tracking-tight",
  h3: "text-base font-bold",
};

const BAR: Record<HeadingLevel, string> = {
  h1: "h-7",
  h2: "h-5",
  h3: "h-4",
};

const ICON_SIZE: Record<HeadingLevel, number> = {
  h1: 24,
  h2: 20,
  h3: 18,
};

/**
 * 各ページ・セクション共通の見出し。
 * 左のアクセントバー＋タイトル（＋アイコン・補足文・右側リンク）で統一感を出す。
 * Server Component / Client Component のどちらからでも利用できる。
 */
export function SectionHeader({
  title,
  as = "h2",
  icon: Icon,
  description,
  action,
  id,
  className = "",
}: Props) {
  const Tag = as;
  const margin = as === "h1" ? "mb-5" : "mb-3";

  return (
    <div className={`${margin} flex items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={`w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-600 to-violet-600 ${BAR[as]}`}
          />
          {Icon && (
            <Icon
              size={ICON_SIZE[as]}
              aria-hidden
              className="shrink-0 text-blue-600 dark:text-blue-400"
            />
          )}
          <Tag id={id} className={`min-w-0 truncate ${SIZE[as]}`}>
            {title}
          </Tag>
        </div>
        {description && (
          <p className="mt-1 pl-3.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        )}
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          {action.label}
          <ChevronRight size={14} aria-hidden />
        </Link>
      )}
    </div>
  );
}
