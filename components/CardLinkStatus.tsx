"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import { useLinkStatus } from "next/link";
import { useEffect, useState } from "react";

type CardLinkStatusProps = {
  idleLabel?: string;
  className?: string;
};

export function CardLinkStatus({
  idleLabel = "読む",
  className = "",
}: CardLinkStatusProps) {
  const { pending } = useLinkStatus();
  const [delayedPending, setDelayedPending] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDelayedPending(pending);
    }, 100);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pending]);

  return (
    <span
      aria-hidden="true"
      data-pending={delayedPending ? "true" : undefined}
      className={`inline-flex items-center gap-1 text-sm text-blue-700 dark:text-blue-300 ${className}`}
    >
      {delayedPending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          <span>読み込み中</span>
        </>
      ) : (
        <>
          <span>{idleLabel}</span>
          <ChevronRight className="size-4" />
        </>
      )}
    </span>
  );
}
