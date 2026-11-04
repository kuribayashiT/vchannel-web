import { SettingsList } from "@/components/SettingsList";

export const metadata = { title: "設定", robots: { index: false } };

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">設定</h1>
      <SettingsList />
    </main>
  );
}
