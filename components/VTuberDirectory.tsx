import { formatNumber } from "@/lib/format";
import { getCachedVTuberPageData } from "@/lib/server-data";
import type { VTuberIndexItem } from "@/types";

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

  const escapeHtml = (value: string): string =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const html = Array.from(grouped.entries())
    .map(([office, members]) => {
      const membersHtml = members
        .map((member) => {
          const href = `/vtuber/${encodeURIComponent(member.channelId)}`;
          return `<li><a href="${href}" class="text-blue-600 hover:underline dark:text-blue-400">${escapeHtml(member.name)}（${formatNumber(member.subscriberCount)}）</a></li>`;
        })
        .join("");
      return `<section class="space-y-2"><h2 class="text-lg font-semibold">${escapeHtml(office)}</h2><ul class="flex flex-wrap gap-x-4 gap-y-2 text-sm">${membersHtml}</ul></section>`;
    })
    .join("");

  return (
    <section className="mt-10 space-y-6">
      <p className="text-xl font-bold tracking-tight">事務所別VTuber一覧</p>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
