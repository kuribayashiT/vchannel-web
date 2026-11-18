import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/about", label: "このサイトについて" },
  { href: "/contact", label: "お問い合わせ" },
  { href: "/terms", label: "利用規約" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/guide", label: "ガイド・特集" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 px-4 py-6 pb-20 text-sm text-zinc-600 md:px-6 md:pb-6 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-300">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <nav aria-label="フッターリンク" className="flex flex-wrap gap-x-4 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="underline-offset-2 hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          当サイトは非公式のファンサイトであり、各VTuber・所属事務所とは関係ありません。
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          © 2026 Vちゃんねる
        </p>
      </div>
    </footer>
  );
}
