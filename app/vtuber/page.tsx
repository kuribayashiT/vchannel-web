import { VTuberTabs } from "@/components/VTuberTabs";

export const metadata = { title: "VTuber | Vちゃんねる" };

export default function VTuberPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <h1 className="mb-4 text-xl font-bold">VTuber</h1>
      <VTuberTabs />
    </main>
  );
}
