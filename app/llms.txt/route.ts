import { cacheLife } from "next/cache";
import { loadVTubers } from "@/lib/server-data";
import { SITE_URL } from "@/lib/site";

async function buildLlmsText(): Promise<string> {
  "use cache";
  cacheLife("days");

  const { index } = await loadVTubers();
  const top50 = [...index]
    .sort((a, b) => b.subscriberCount - a.subscriberCount)
    .slice(0, 50)
    .map((item, i) => `${i + 1}. ${SITE_URL}/vtuber/${item.channelId} # ${item.name}`);

  return [
    "# Vちゃんねる",
    "",
    "VTuberの配信予定・ランキング・イベント情報をまとめたサイトです。",
    "",
    "## 主要ページ",
    `- ランキング: ${SITE_URL}/ranking`,
    `- VTuber一覧: ${SITE_URL}/vtuber`,
    `- 誕生日・周年ページ例: ${SITE_URL}/events/11-09`,
    `- ニュース: ${SITE_URL}/news`,
    "",
    "## データ出典と更新頻度",
    "- 出典: YouTube公開データを集計した公開JSON（Google Cloud Storage）",
    "- 更新頻度: ランキング・登録者情報は定期更新、配信情報は数分〜1時間単位で更新",
    "",
    "## 登録者数上位50人の詳細ページ",
    ...top50,
    "",
  ].join("\n");
}

export async function GET() {
  const body = await buildLlmsText();
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
