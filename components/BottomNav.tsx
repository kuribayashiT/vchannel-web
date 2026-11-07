"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageCircle,
  Newspaper,
  Radio,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "配信", icon: Radio },
  { href: "/news", label: "ニュース", icon: Newspaper },
  { href: "/vtuber", label: "VTuber", icon: Users },
  { href: "/ranking", label: "ランキング", icon: Trophy },
  { href: "/chat", label: "チャット", icon: MessageCircle },
];

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
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-zinc-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/90"
    >
      {ITEMS.map((i) => {
        const active =
          i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
        const Icon = i.icon;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 ${
              active
                ? "font-bold text-blue-600"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {active && (
              <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-blue-600" />
            )}
            <Icon size={20} aria-hidden />
            <span className="text-[10px] leading-none">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
