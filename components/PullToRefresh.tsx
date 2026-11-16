"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";

const MAX_PULL = 80;
const TRIGGER_PULL = 64;

export function PullToRefresh({
  disabled,
  refreshing,
  onRefresh,
}: {
  disabled: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [pullY, setPullY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const pullRef = useRef(0);
  const activeRef = useRef(false);
  const cancelRef = useRef(false);
  const refreshingRef = useRef(refreshing);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const prev = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";
    return () => {
      root.style.overscrollBehaviorY = prev;
    };
  }, []);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        activeRef.current = false;
        cancelRef.current = true;
        return;
      }
      if (disabledRef.current || refreshingRef.current || window.scrollY > 0) {
        activeRef.current = false;
        cancelRef.current = true;
        return;
      }
      const touch = event.touches[0];
      startYRef.current = touch.clientY;
      startXRef.current = touch.clientX;
      pullRef.current = 0;
      cancelRef.current = false;
      activeRef.current = true;
      setDragging(true);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!activeRef.current || cancelRef.current || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dy = touch.clientY - startYRef.current;
      const dx = touch.clientX - startXRef.current;

      if (Math.abs(dx) > Math.abs(dy)) {
        activeRef.current = false;
        setDragging(false);
        setPullY(0);
        return;
      }
      if (dy <= 0) {
        setPullY(0);
        return;
      }

      event.preventDefault();
      const nextPull = Math.min(MAX_PULL, dy / 2);
      pullRef.current = nextPull;
      setPullY(nextPull);
    };

    const onTouchEnd = () => {
      if (!activeRef.current || cancelRef.current) {
        setDragging(false);
        setPullY(0);
        return;
      }
      const shouldRefresh = pullRef.current >= TRIGGER_PULL && !disabledRef.current && !refreshingRef.current;
      activeRef.current = false;
      setDragging(false);
      setPullY(0);
      if (!shouldRefresh) return;
      void onRefresh();
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [onRefresh]);

  const shownPullY = refreshing ? TRIGGER_PULL : pullY;
  const active = refreshing || dragging || shownPullY > 0;
  const shouldSpin = refreshing || shownPullY >= TRIGGER_PULL;
  const opacity = useMemo(
    () => Math.min(1, Math.max(0, shownPullY / TRIGGER_PULL)),
    [shownPullY],
  );
  const translateY = active ? shownPullY : -64;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center transition-transform duration-150"
      style={{ transform: `translateY(${translateY}px)` }}
    >
      <div
        className="mt-2 rounded-full bg-white/95 px-3 py-1.5 text-zinc-600 shadow ring-1 ring-zinc-200 dark:bg-zinc-900/95 dark:text-zinc-200 dark:ring-zinc-700"
        style={{ opacity }}
      >
        <RotateCw
          size={18}
          className={shouldSpin ? "animate-spin motion-reduce:animate-none" : ""}
        />
      </div>
    </div>
  );
}
