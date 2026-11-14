"use client";

import { useSyncExternalStore } from "react";
import { todayJstParts } from "@/lib/events";
import {
  getProfileDateCountdown,
  type ProfileDebutDate,
} from "@/lib/profile-date";

const subscribe = () => () => {};

function getTodaySnapshot(): string {
  const { y, m, d } = todayJstParts();
  return `${y}-${m}-${d}`;
}

export function DateCountdown({
  date,
  kind,
}: {
  date: ProfileDebutDate;
  kind: "birthday" | "debut";
}) {
  const snapshot = useSyncExternalStore(subscribe, getTodaySnapshot, () => "");
  if (!snapshot) return null;

  const [year, month, day] = snapshot.split("-").map(Number);
  const countdown = getProfileDateCountdown(date, kind, {
    year,
    month,
    day,
  });
  if (!countdown.badge && !countdown.text) return null;

  const badgeClass =
    countdown.tone === "amber"
      ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
      : "rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-900/60 dark:text-violet-200";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
      {countdown.badge && (
        <span className={badgeClass}>{countdown.badge}</span>
      )}
      {countdown.text && <span>{countdown.text}</span>}
    </span>
  );
}
