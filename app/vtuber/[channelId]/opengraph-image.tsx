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
const FALLBACK_TEXT = "VTuber詳細";
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_FONT_CACHE = 50;

type OgFont = {
  name: string;
  data: ArrayBuffer;
  style: "normal";
  weight: 700;
};

/** 文字集合をキーにしたフォントのメモ化（失敗時はキャッシュから外す） */
const fontCache = new Map<string, Promise<ArrayBuffer>>();

function uniqueChars(text: string): string {
  return Array.from(new Set(Array.from(text))).sort().join("");
}

async function fetchFont(chars: string): Promise<ArrayBuffer> {
  const cssRes = await fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(chars)}`,
  );
  if (!cssRes.ok) throw new Error(`Failed to fetch Google Fonts CSS: ${cssRes.status}`);
  const css = await cssRes.text();
  const match = css.match(/src: url\(([^)]+)\)/);
  if (!match) throw new Error("Font source URL not found");
  const fontRes = await fetch(match[1]);
  if (!fontRes.ok) throw new Error(`Failed to fetch font data: ${fontRes.status}`);
  return fontRes.arrayBuffer();
}

function loadFontFor(text: string): Promise<ArrayBuffer> {
  const chars = uniqueChars(text);
  const cached = fontCache.get(chars);
  if (cached) return cached;
  if (fontCache.size >= MAX_FONT_CACHE) {
    const oldest = fontCache.keys().next().value;
    if (oldest !== undefined) fontCache.delete(oldest);
  }
  const promise = fetchFont(chars).catch((error: unknown) => {
    fontCache.delete(chars);
    throw error;
  });
  fontCache.set(chars, promise);
  return promise;
}

/** フォント取得に失敗しても画像は返したいので、空配列にフォールバックする */
async function loadFonts(text: string): Promise<OgFont[]> {
  try {
    const data = await loadFontFor(text);
    return [{ name: BASE_FONT, data, style: "normal", weight: 700 }];
  } catch (error) {
    console.error("[opengraph-image] font load failed", error);
    return [];
  }
}

/** YouTube のアイコンを PNG/JPEG に限り data URL にする。失敗時は null */
async function loadIconDataUrl(thumbnail: string): Promise<string | null> {
  try {
    const url = thumbnail.replace(/=s\d+[^/?#]*$/, "=s400-c-k-c0x00ffffff-no-rj");
    const res = await fetch(url, {
      headers: { Accept: "image/png,image/jpeg" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type !== "image/png" && type !== "image/jpeg") return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_ICON_BYTES) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch (error) {
    console.error("[opengraph-image] icon fetch failed", error);
    return null;
  }
}

async function fallbackImage(): Promise<ImageResponse> {
  const fonts = await loadFonts(`${SITE_NAME}${FALLBACK_TEXT}`);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#fff",
          fontFamily: BASE_FONT,
        }}
      >
        <div style={{ fontSize: 40, opacity: 0.85 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 56, marginTop: 16 }}>{FALLBACK_TEXT}</div>
      </div>
    ),
    { ...size, fonts },
  );
}

async function buildImage(channelId: string): Promise<ImageResponse> {
  const detail = await getCachedVTuberDetail(channelId);
  if (!detail) return fallbackImage();

  const officeLine = `${detail.office} 所属`;
  const stats = [
    `登録者数 ${formatNumber(detail.subscriberCount)}人（${formatCompact(detail.subscriberCount)}）`,
    `総再生数 ${formatCompact(detail.viewCount)}`,
    `動画本数 ${formatCompact(detail.videoCount)}`,
  ];
  const initial = Array.from(detail.name)[0] ?? "V";

  const [iconDataUrl, fonts] = await Promise.all([
    detail.thumbnail ? loadIconDataUrl(detail.thumbnail) : Promise.resolve(null),
    loadFonts(
      [officeLine, "所属", detail.name, initial, ...stats, SITE_NAME, FALLBACK_TEXT].join(""),
    ),
  ]);

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
        {iconDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconDataUrl}
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
        ) : (
          <div
            style={{
              width: 280,
              height: 280,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.16)",
              border: "8px solid rgba(255,255,255,0.16)",
              marginRight: 40,
              alignSelf: "center",
              fontSize: 120,
            }}
          >
            {initial}
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 28, opacity: 0.9 }}>{officeLine}</div>
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
    { ...size, fonts },
  );
}

export default async function Image({ params }: ImageProps) {
  try {
    const { channelId } = await params;
    return await buildImage(channelId);
  } catch (error) {
    console.error("[opengraph-image] failed, returning fallback image", error);
    return fallbackImage();
  }
}
