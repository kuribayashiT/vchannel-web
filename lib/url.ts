/** http(s) 以外（javascript: など）は null にして外部リンクに使わない */
export function safeHttpUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** YouTube/Google のアイコン URL 末尾の `=s800-...` を一覧向けの小サイズに差し替える */
export function smallAvatar(url: string, size = 96): string {
  return url.replace(/=s\d+(-|$)/, `=s${size}$1`);
}
