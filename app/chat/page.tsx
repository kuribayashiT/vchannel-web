import { ChatBoard } from "@/components/ChatBoard";
import { getOfficeSummaries } from "@/lib/offices";

export const metadata = { title: "チャット" };

export default async function ChatPage() {
  const offices = await getOfficeSummaries();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <h1 className="mb-4 text-xl font-bold">チャット</h1>
      <ChatBoard offices={offices} />
    </main>
  );
}
