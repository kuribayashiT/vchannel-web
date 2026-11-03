import type { NextRequest } from "next/server";

const ALLOWED =
  /^(news\.google\.com|[a-z0-9-]+\.gstatic\.com|lh\d\.googleusercontent\.com)$/;
const MAX_BYTES = 3 * 1024 * 1024;

/** リダイレクトも含め許可ホストのみ辿る（SSRF 対策） */
async function fetchImage(url: string, hops = 0): Promise<Response | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !ALLOWED.test(u.hostname) || hops > 3) {
    return null;
  }
  const res = await fetch(u, {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; VchannelWeb)" },
  });
  const loc = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && loc) {
    return fetchImage(new URL(loc, u).toString(), hops + 1);
  }
  return res;
}

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("u") ?? "";
  const res = await fetchImage(src).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  if (!res?.ok || !type.startsWith("image/")) {
    return new Response(null, { status: 404 });
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return new Response(null, { status: 404 });
  return new Response(buf, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
    },
  });
}
