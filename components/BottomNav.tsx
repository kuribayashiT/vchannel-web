"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "配信" },
  { href: "/news", label: "ニュース" },
  { href: "/vtuber", label: "VTuber" },
  { href: "/ranking", label: "ランキング" },
  { href: "/chat", label: "チャット" },
] as const;

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="サイトナビゲーション" className="hidden gap-1 md:flex">
      {ITEMS.map((i) => {
        const active =
          i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              active
                ? "bg-blue-600 font-bold text-white"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 md:hidden border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black"
    >
      {ITEMS.map((i) => {
        const active =
          i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 items-center justify-center text-sm ${
              active
                ? "font-bold text-blue-600"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
