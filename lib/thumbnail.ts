const YT_THUMBNAIL_PREFIX = "https://yt3.ggpht.com/";
const SIZE_PARAM_PATTERN = /=s[^?]*/;

export function shortenYtThumb(url: string): string {
  if (!url.startsWith(YT_THUMBNAIL_PREFIX)) return url;
  return url.slice(YT_THUMBNAIL_PREFIX.length).replace(SIZE_PARAM_PATTERN, "");
}

export function ytThumbUrl(shortOrUrl: string, size: number): string {
  if (
    shortOrUrl.startsWith("http://") ||
    shortOrUrl.startsWith("https://")
  ) {
    return shortOrUrl;
  }
  return `${YT_THUMBNAIL_PREFIX}${shortOrUrl}=s${size}-c-k-c0x00ffffff-no-rj`;
}
