"use client";

import { useEffect, useState } from "react";
import { VTuberTabs } from "@/components/VTuberTabs";
import type { VTuberTabItem } from "@/types";

type VTuberTabsIslandProps = {
  initialIndex?: VTuberTabItem[];
};

export function VTuberTabsIsland({ initialIndex }: VTuberTabsIslandProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <p className="py-16 text-center text-zinc-500">Vtuberリストを読み込み中…</p>;
  }

  return <VTuberTabs initialIndex={initialIndex} />;
}
