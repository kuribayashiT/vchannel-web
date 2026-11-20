import { ChevronDown } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { getCachedVTuberPageData } from "@/lib/server-data";
import { ytThumbUrl } from "@/lib/thumbnail";
import type { VTuberIndexItem } from "@/types";

type OfficeDirectoryItem = {
  name: string;
  thumbnail?: string;
  members: VTuberIndexItem[];
};

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sortBySubscriber(members: VTuberIndexItem[]): VTuberIndexItem[] {
  return [...members].sort((a, b) => b.subscriberCount - a.subscriberCount);
}

function officePreviewText(members: VTuberIndexItem[]): string {
  if (members.length === 0) return "";
  const sorted = sortBySubscriber(members);
  const names = sorted.slice(0, 3).map((member) => member.name).join("、");
  if (sorted.length <= 3) return names;
  return `${names} ほか${formatNumber(sorted.length - 3)}人`;
}

/**
 * メンバーへのリンクを HTML 文字列で作る（<Link> を使うと RSC ペイロードが倍増するため）。
 * 各 <a> に class は付けず、親要素のセレクタで装飾して HTML を軽く保つ。
 */
function memberChipsHtml(members: VTuberIndexItem[]): string {
  const sorted = sortBySubscriber(members);
  return sorted
    .map((member) => {
      const href = `/vtuber/${encodeURIComponent(member.channelId)}`;
      const name = escapeHtml(member.name);
      const subscribers = escapeHtml(formatNumber(member.subscriberCount));
      return `<a href="${href}">${name} <i>${subscribers}</i></a>`;
    })
    .join("");
}

const CHIP_STYLE = [
  "[&_a]:inline-flex",
  "[&_a]:items-center",
  "[&_a]:rounded-full",
  "[&_a]:border",
  "[&_a]:border-zinc-200",
  "[&_a]:px-3",
  "[&_a]:py-1",
  "[&_a]:text-violet-700",
  "[&_a:hover]:border-violet-300",
  "[&_a:hover]:bg-violet-50",
  "[&_a_i]:ml-1",
  "[&_a_i]:text-[10px]",
  "[&_a_i]:not-italic",
  "[&_a_i]:tabular-nums",
  "[&_a_i]:text-zinc-500",
  "dark:[&_a]:border-zinc-700",
  "dark:[&_a]:text-violet-300",
  "dark:[&_a:hover]:border-violet-700",
  "dark:[&_a:hover]:bg-violet-900/20",
  "dark:[&_a_i]:text-zinc-400",
].join(" ");

/** 全事務所・全メンバーをサーバーレンダリングする一覧（フィルターの影響を受けない） */
export async function VTuberDirectory() {
  let offices: OfficeDirectoryItem[];
  let officeCount = 0;
  let memberCount = 0;
  try {
    const data = await getCachedVTuberPageData();
    const grouped = new Map<string, VTuberIndexItem[]>();
    for (const item of data.directoryItems) {
      const list = grouped.get(item.office);
      if (list) {
        list.push(item);
      } else {
        grouped.set(item.office, [item]);
      }
    }

    const groupedInOrder = data.officeGroups
      .map((group) => ({
        name: group.name,
        thumbnail: group.thumbnail,
        members: grouped.get(group.name) ?? [],
      }))
      .filter((group) => group.members.length > 0);

    offices = groupedInOrder;
    officeCount = groupedInOrder.length;
    memberCount = data.directoryItems.length;
  } catch {
    return null;
  }

  if (offices.length === 0) return null;

  return (
    <section id="offices" aria-label="事務所から探す" className="mt-10">
      <h2 className="text-xl font-bold tracking-tight">事務所から探す</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {formatNumber(officeCount)}事務所・{formatNumber(memberCount)}
        人のVTuberを事務所ごとに一覧できます。
      </p>

      <div className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {offices.map((office) => (
          <details key={office.name} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 [&::-webkit-details-marker]:hidden">
              {office.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ytThumbUrl(office.thumbnail, 48)}
                  alt=""
                  loading="lazy"
                  className="size-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  {office.name.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">{office.name}</h2>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {officePreviewText(office.members)}
                </p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                {formatNumber(office.members.length)}人
              </span>
              <ChevronDown
                size={16}
                aria-hidden
                className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
              />
            </summary>
            <div
              className={`px-4 pb-3 ${office.members.length > 60 ? "max-h-72 overflow-y-auto" : ""}`}
            >
              <div
                className={`flex flex-wrap gap-1.5 text-xs ${CHIP_STYLE}`}
                dangerouslySetInnerHTML={{ __html: memberChipsHtml(office.members) }}
              />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
