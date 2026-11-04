import { VTuberTabs } from "@/components/VTuberTabs";

export const metadata = { title: "VTuber" };

export default function VTuberPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">VTuber</h1>
      <VTuberTabs />
    </main>
  );
}
