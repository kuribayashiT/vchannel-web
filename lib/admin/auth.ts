/**
 * 管理画面の Basic 認証。proxy.ts と /api/admin/* の両方で使う（多重防御）。
 * ADMIN_USER / ADMIN_PASSWORD のどちらかが未設定なら "disabled"（= 404 扱い）。
 */
export type AdminAuthResult = "ok" | "denied" | "disabled";

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function checkAdminAuth(authorization: string | null): AdminAuthResult {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) return "disabled";
  if (!authorization?.startsWith("Basic ")) return "denied";
  let decoded: string;
  try {
    decoded = decodeBase64Utf8(authorization.slice(6).trim());
  } catch {
    return "denied";
  }
  const i = decoded.indexOf(":");
  if (i < 0) return "denied";
  const okUser = safeEqual(decoded.slice(0, i), user);
  const okPass = safeEqual(decoded.slice(i + 1), pass);
  return okUser && okPass ? "ok" : "denied";
}
