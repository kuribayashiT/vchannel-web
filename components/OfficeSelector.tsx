"use client";

import { useMemo, useState } from "react";
import type { OfficeSummary } from "@/lib/offices";
import { normalizeForSearch } from "@/lib/search";

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
  const allIds = useMemo(
    () => [...new Set(offices.flatMap((o) => o.members.map((m) => m.channelId)))],
    [offices],
  );

  const normalizedQuery = useMemo(
    () => normalizeForSearch(query.trim()),
    [query],
  );
  const visible = useMemo(
    () =>
      offices
        .map((o) => ({
          ...o,
          members: normalizedQuery
            ? o.members.filter((m) =>
                normalizeForSearch(m.name).includes(normalizedQuery),
              )
            : o.members,
        }))
        .filter((o) => o.members.length > 0),
    [offices, normalizedQuery],
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(allIds)}
          disabled={allIds.length === 0 || allIds.every((id) => sel.has(id))}
          className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          全選択
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={selected.length === 0}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          選択解除
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            該当するVTuberが見つかりません
          </p>
        ) : (
          visible.map((o) => {
            const ids = o.members.map((m) => m.channelId);
            const open = normalizedQuery !== "" || expanded.has(o.name);
            const officeState = stateOf(ids, sel);
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
                      officeState === "some" ? "mixed" : officeState === "all"
                    }
                    aria-label={`${o.name}を全員選択/解除`}
                    onClick={() => toggleIds(ids)}
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs transition-all hover:scale-105 ${circle[officeState]}`}
                  >
                    {officeState === "all" && "✓"}
                    {officeState === "some" && "−"}
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
                  <ul className="space-y-1 pb-2 pl-9">
                    {o.members.map((m) => (
                      <li key={m.channelId}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={sel.has(m.channelId)}
                          onClick={() => toggleIds([m.channelId])}
                          className={`group flex w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-left text-sm transition ${
                            sel.has(m.channelId)
                              ? "border-violet-300 bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-900 shadow-sm shadow-violet-200/60 dark:border-violet-700 dark:from-violet-900/50 dark:to-fuchsia-900/40 dark:text-violet-100 dark:shadow-none"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-violet-300 hover:bg-violet-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-violet-700 dark:hover:bg-violet-950/30"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                              sel.has(m.channelId)
                                ? "bg-white/80 text-violet-700 dark:bg-zinc-900/80 dark:text-violet-200"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            {m.name.slice(0, 1)}
                          </span>
                          <span className="truncate">{m.name}</span>
                          <span
                            aria-hidden
                            className={`ml-auto flex size-5 items-center justify-center rounded-full text-[11px] transition ${
                              sel.has(m.channelId)
                                ? "bg-violet-600 text-white"
                                : "bg-zinc-200 text-transparent dark:bg-zinc-700"
                            }`}
                          >
                            ✓
                          </span>
                        </button>
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
