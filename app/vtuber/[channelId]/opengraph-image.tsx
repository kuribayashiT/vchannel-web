import { ImageResponse } from "next/og";
import { formatCompact, formatNumber } from "@/lib/format";
import { getCachedVTuberDetail } from "@/lib/server-data";
import { SITE_NAME } from "@/lib/site";

type ImageProps = {
  params: Promise<{ channelId: string }>;
};

export const contentType = "image/png";
export const size = {
  width: 1200,
  height: 630,
};

const BASE_FONT = "Noto Sans JP";

let fontDataPromise: Promise<ArrayBuffer> | null = null;

async function loadNotoSansJpFont(): Promise<ArrayBuffer> {
  if (!fontDataPromise) {
    const text = "0123456789VTuber登録者数総再生数動画本数所属ちゃんねる";
    fontDataPromise = (async () => {
      const cssRes = await fetch(
        `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`,
      );
      if (!cssRes.ok) throw new Error("Failed to fetch Google Fonts CSS");
      const css = await cssRes.text();
      const match = css.match(/src: url\(([^)]+)\)/);
      if (!match) throw new Error("Font source URL not found");
      const fontRes = await fetch(match[1]);
      if (!fontRes.ok) throw new Error("Failed to fetch font data");
      return fontRes.arrayBuffer();
    })();
  }
  return fontDataPromise;
}

export default async function Image({ params }: ImageProps) {
  const { channelId } = await params;
  const detail = await getCachedVTuberDetail(channelId);
  const fontData = await loadNotoSansJpFont();

  if (!detail) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#fff",
            fontSize: 56,
            fontFamily: BASE_FONT,
          }}
        >
          VTuber詳細
        </div>
      ),
      {
        ...size,
        fonts: [{ name: BASE_FONT, data: fontData, style: "normal", weight: 700 }],
      },
    );
  }

  const stats = [
    `登録者数 ${formatNumber(detail.subscriberCount)}人（${formatCompact(detail.subscriberCount)}）`,
    `総再生数 ${formatCompact(detail.viewCount)}`,
    `動画本数 ${formatCompact(detail.videoCount)}`,
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #1d4ed8 0%, #0f172a 100%)",
          color: "#fff",
          fontFamily: BASE_FONT,
          position: "relative",
          overflow: "hidden",
          padding: 56,
        }}
      >
        {detail.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={detail.thumbnail}
            alt=""
            width={280}
            height={280}
            style={{
              borderRadius: "50%",
              objectFit: "cover",
              border: "8px solid rgba(255,255,255,0.16)",
              marginRight: 40,
              alignSelf: "center",
            }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 28, opacity: 0.9 }}>{detail.office} 所属</div>
          <div
            style={{
              fontSize: 62,
              lineHeight: 1.15,
              marginTop: 12,
              maxWidth: 760,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {detail.name}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
            {stats.map((line) => (
              <div key={line} style={{ fontSize: 30, opacity: 0.95 }}>
                {line}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            right: 40,
            bottom: 28,
            fontSize: 28,
            opacity: 0.85,
          }}
        >
          {SITE_NAME}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: BASE_FONT, data: fontData, style: "normal", weight: 700 }],
    },
  );
}
