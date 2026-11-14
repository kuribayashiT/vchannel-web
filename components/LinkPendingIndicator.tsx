"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

export function LinkPendingIndicator({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useLinkStatus();

  return (
    <span
      className={`inline-flex transition-opacity delay-100 ${
        pending ? "opacity-60" : ""
      } ${className}`}
    >
      {children}
    </span>
  );
}
