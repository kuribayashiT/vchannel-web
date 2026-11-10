import type { Metadata } from "next";
import { VTuberDirectory } from "@/components/VTuberDirectory";
import { VTuberTabsIsland } from "@/components/VTuberTabsIsland";
import { getCachedVTuberPageData } from "@/lib/server-data";
import type { VTuberTabItem } from "@/types";

const PAGE_TITLE = "VTuber一覧（事務所別）";

function buildSummary(officeCount: number, memberCount: number): string {
  return `Vちゃんねるでは${officeCount}事務所・${memberCount}人のVTuberの登録者数や配信情報をまとめています。`;
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { officeCount, memberCount } = await getCachedVTuberPageData();
    return {
      title: PAGE_TITLE,
      description: buildSummary(officeCount, memberCount),
    };
  } catch {
    return {
      title: PAGE_TITLE,
      description: "VちゃんねるのVTuber一覧ページです。事務所別にVTuber情報を確認できます。",
    };
  }
}

export default async function VTuberPage() {
  let initialIndex: VTuberTabItem[] | undefined;
  let summary =
    "VちゃんねるではVTuberの登録者数や配信情報を事務所別にまとめています。";

  try {
    const data = await getCachedVTuberPageData();
    initialIndex = data.tabItems;
    summary = buildSummary(data.officeCount, data.memberCount);
  } catch {
    // 取得失敗時はクライアント fetch にフォールバックする
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-3 text-2xl font-extrabold tracking-tight">
        VTuber一覧（事務所別）
      </h1>
      <p className="mb-5 text-sm text-zinc-600 dark:text-zinc-300">{summary}</p>
      <VTuberTabsIsland initialIndex={initialIndex} />
      <VTuberDirectory />
    </main>
  );
}
