import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { getCachedVTuberPageData } from "@/lib/server-data";
import type { VTuberIndexItem } from "@/types";

/** 全事務所・全メンバーをサーバーレンダリングする一覧（フィルターの影響を受けない） */
export async function VTuberDirectory() {
  let items: VTuberIndexItem[];
  try {
    const data = await getCachedVTuberPageData();
    items = data.directoryItems;
  } catch {
    return null;
  }

  const grouped = new Map<string, VTuberIndexItem[]>();
  for (const item of items) {
    const list = grouped.get(item.office);
    if (list) {
      list.push(item);
      continue;
    }
    grouped.set(item.office, [item]);
  }

  if (grouped.size === 0) return null;

  return (
    <section aria-label="事務所から探す" className="mt-10 space-y-4">
      <p className="text-xl font-bold tracking-tight">事務所から探す</p>
      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([office, members]) => (
          <details
            key={office}
            className="group rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <h2 className="min-w-0 truncate text-base font-semibold">
                {office}
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  {formatNumber(members.length)}人
                </span>
              </h2>
              <ChevronDown
                size={18}
                aria-hidden
                className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
              />
            </summary>
            <ul className="flex flex-wrap gap-2 px-4 pb-4 text-sm">
              {members.map((member) => (
                <li key={member.channelId}>
                  <Link
                    href={`/vtuber/${encodeURIComponent(member.channelId)}`}
                    className="inline-block rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-blue-600 transition-colors hover:bg-blue-50 hover:underline dark:border-zinc-700 dark:bg-zinc-800 dark:text-blue-400 dark:hover:bg-zinc-700"
                  >
                    {member.name}
                    <span className="ml-1 text-xs text-zinc-500">
                      （{formatNumber(member.subscriberCount)}）
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
