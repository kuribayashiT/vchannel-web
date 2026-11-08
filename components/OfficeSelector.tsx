"use client";

import { useMemo, useState } from "react";
import type { OfficeSummary } from "@/lib/offices";

type State = "all" | "some" | "none";

function stateOf(ids: string[], selected: Set<string>): State {
  const n = ids.filter((id) => selected.has(id)).length;
  return n === 0 ? "none" : n === ids.length ? "all" : "some";
}

const circle: Record<State, string> = {
  all: "border-violet-500 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-300/60 dark:shadow-violet-900/30",
  some: "border-sky-400 bg-gradient-to-br from-sky-200 to-violet-200 text-sky-700 dark:from-sky-900/50 dark:to-violet-900/40 dark:text-sky-200",
  none: "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-500",
};

/** 検索・事務所の展開/折りたたみ・事務所ごとの一括トグルを持つ選択 UI */
export function OfficeSelector({
  offices,
  selected,
  onChange,
}: {
  offices: OfficeSummary[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sel = useMemo(() => new Set(selected), [selected]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      offices
        .map((o) => ({
          ...o,
          members: q
            ? o.members.filter((m) => m.name.toLowerCase().includes(q))
            : o.members,
        }))
        .filter((o) => o.members.length > 0),
    [offices, q],
  );

  const toggleIds = (ids: string[]) => {
    const next = new Set(sel);
    const allOn = ids.every((id) => next.has(id));
    for (const id of ids) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    onChange([...next]);
  };

  const toggleExpand = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="VTuber名で検索..."
        className="w-full rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            該当するVTuberが見つかりません
          </p>
        ) : (
          visible.map((o) => {
            const ids = o.members.map((m) => m.channelId);
            const open = q !== "" || expanded.has(o.name);
            return (
              <div
                key={o.name}
                className="border-b border-zinc-200 dark:border-zinc-800"
              >
                <div className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={
                      stateOf(ids, sel) === "some"
                        ? "mixed"
                        : stateOf(ids, sel) === "all"
                    }
                    aria-label={`${o.name}を全員選択/解除`}
                    onClick={() => toggleIds(ids)}
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs transition-all hover:scale-105 ${circle[stateOf(ids, sel)]}`}
                  >
                    {stateOf(ids, sel) === "all" && "✓"}
                    {stateOf(ids, sel) === "some" && "−"}
                  </button>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleExpand(o.name)}
                    className="flex flex-1 items-center justify-between text-left text-sm font-medium"
                  >
                    <span>{o.name}</span>
                    <span className="text-xs text-zinc-500">
                      {open ? "▲" : "▼"}
                    </span>
                  </button>
                </div>
                {open && (
                  <ul className="pb-2 pl-9">
                    {o.members.map((m) => (
                      <li key={m.channelId}>
                        <label className="group flex cursor-pointer items-center gap-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            checked={sel.has(m.channelId)}
                            onChange={() => toggleIds([m.channelId])}
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden
                            className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] transition-all ${
                              sel.has(m.channelId)
                                ? "border-violet-500 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-300/60 dark:shadow-violet-900/30"
                                : "border-zinc-300 bg-white text-transparent group-hover:border-violet-300 dark:border-zinc-600 dark:bg-zinc-900"
                            }`}
                          >
                            ✓
                          </span>
                          <span className="truncate">{m.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
