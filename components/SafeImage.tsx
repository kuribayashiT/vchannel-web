"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, User, type LucideIcon } from "lucide-react";

type Variant = "avatar" | "thumbnail";

type Props = {
  src: string | null | undefined;
  alt?: string;
  /** 画像と同じサイズ・形状指定（例: "size-11 rounded-full object-cover"）。フォールバック表示にも適用される */
  className?: string;
  /** フォールバックのアイコン種別。avatar=人物 / thumbnail=画像 */
  variant?: Variant;
  loading?: "lazy" | "eager";
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
};

const ICONS: Record<Variant, LucideIcon> = {
  avatar: User,
  thumbnail: ImageOff,
};

/**
 * 画像の読み込みに失敗した場合（404・ブロック・src 空）に、
 * ブラウザ標準の壊れ画像アイコンではなくプレースホルダーを表示する。
 */
export function SafeImage({
  src,
  alt = "",
  className = "",
  variant = "thumbnail",
  loading = "lazy",
  referrerPolicy = "no-referrer",
}: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const Icon = ICONS[variant];

  // ハイドレーション前にエラー済みだった画像（onError が発火しないケース）も検知する
  useEffect(() => {
    const el = imgRef.current;
    if (el && src && el.complete && el.naturalWidth === 0) {
      setFailedSrc(src);
    }
  }, [src]);

  const failed = !src || failedSrc === src;

  if (failed) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={`flex items-center justify-center overflow-hidden bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 ${className}`}
      >
        <Icon className="size-1/2 max-h-10 max-w-10" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading={loading}
      referrerPolicy={referrerPolicy}
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}
