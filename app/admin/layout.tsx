import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "VTuber 管理" },
  robots: { index: false, follow: false },
};

/**
 * 管理画面。ルートレイアウトの AppShell（ヘッダー・BottomNav・広告）の上に
 * 全画面で重ねて表示し、公開サイト側のファイルには手を入れない。
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {children}
    </div>
  );
}
