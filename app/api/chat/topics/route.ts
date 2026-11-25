import type { NextRequest } from "next/server";
import { isTopicId, videoIdOfTopic, type ChatTopic } from "@/lib/chat";
import {
  getTopicVideo,
  listActiveTopics,
  listTopicSuggestions,
} from "@/lib/chat-topics";
import { getTopicDoc } from "@/lib/firestore";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (id !== null) {
    if (!isTopicId(id)) {
      return Response.json({ error: "スレッドが不正です" }, { status: 400 });
    }
    const videoId = videoIdOfTopic(id);
    try {
      const video = await getTopicVideo(videoId);
      if (!video) {
        return Response.json(
          { error: "この配信は見つかりません" },
          { status: 404 },
        );
      }
      const doc = await getTopicDoc(id);
      const topic: ChatTopic = {
        id,
        videoId,
        title: video.title,
        channelId: video.channelId,
        channelTitle: video.channelTitle,
        thumbnail: video.thumbnail,
        isLive: video.isLive,
        postCount: doc?.postCount ?? 0,
        lastUpdated: doc?.lastUpdated ?? null,
      };
      return Response.json({ topic });
    } catch {
      return Response.json({ error: "取得に失敗しました" }, { status: 502 });
    }
  }

  try {
    const topics = await listActiveTopics();
    const suggestions = await listTopicSuggestions(topics.map((t) => t.id));
    return Response.json({ topics, suggestions });
  } catch {
    return Response.json({ error: "取得に失敗しました" }, { status: 502 });
  }
}
