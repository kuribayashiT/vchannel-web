import { ChatBoard } from "@/components/ChatBoard";
import { getOfficeSummaries } from "@/lib/offices";

export const metadata = { title: "チャット" };

export default async function ChatPage() {
  const offices = await getOfficeSummaries();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">チャット</h1>
      <ChatBoard offices={offices} />
    </main>
  );
}
