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

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black"
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
