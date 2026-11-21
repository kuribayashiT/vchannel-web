"use client";

import type { ReactNode } from "react";
import { sendNewsClick } from "@/lib/news-click-client";

export function NewsExternalLink({
  id,
  href,
  className,
  children,
}: {
  id: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => sendNewsClick(id)}
    >
      {children}
    </a>
  );
}
