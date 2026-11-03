import { SettingsList } from "@/components/SettingsList";

export const metadata = { title: "設定", robots: { index: false } };

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <h1 className="mb-4 text-xl font-bold">設定</h1>
      <SettingsList />
    </main>
  );
}
