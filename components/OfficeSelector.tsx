"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, User } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { toggleChannelSelection } from "@/hooks/useSelection";
import type { OfficeSummary } from "@/lib/offices";
import { normalizeForSearch } from "@/lib/search";
import { ytThumbUrl } from "@/lib/thumbnail";

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

let thumbnailCache: Record<string, string> | null = null;
let thumbnailRequest: Promise<Record<string, string>> | null = null;

/** 検索・事務所の展開/折りたたみ・事務所ごとの一括トグルを持つ選択 UI */
export function OfficeSelector({
  offices,
  selected,
  onChange,
}: {
  offices: OfficeSummary[];
  selected: string[];
  onChange: (next: string[], allIds?: readonly string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [thumbnails, setThumbnails] = useState<Record<string, string> | null>(
    thumbnailCache,
  );
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
          allMemberIds: o.members.map((member) => member.channelId),
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
    onChange(toggleChannelSelection(selected, ids, allIds), allIds);
  };

  const allMode = selected.length === 0;
  const isSelected = (id: string) => allMode || sel.has(id);

  const toggleOffice = (ids: string[], allMemberIds: string[]) => {
    if (allMode) {
      onChange(toggleChannelSelection(selected, allMemberIds, allIds), allIds);
      return;
    }
    onChange(toggleChannelSelection(selected, ids, allIds), allIds);
  };

  const toggleMember = (id: string) => {
    toggleIds([id]);
  };

  const toggleExpand = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  useEffect(() => {
    if (!thumbnailRequest) {
      const request = thumbnailCache
        ? Promise.resolve(thumbnailCache)
        : fetch("/api/office-thumbnails").then((res) =>
            res.ok
              ? (res.json() as Promise<Record<string, string>>)
              : Promise.reject(new Error(`HTTP ${res.status}`)),
          );
      thumbnailRequest = request
        .then((data) => {
          thumbnailCache = data;
          return data;
        })
        .catch((e) => {
          console.error("Failed to fetch office thumbnails", e);
          thumbnailCache = {};
          return {};
        })
        .finally(() => {
          thumbnailRequest = null;
        });
    }
    let cancelled = false;
    thumbnailRequest.then((data) => {
      if (!cancelled) setThumbnails(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="VTuber名で検索..."
        className="w-full rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      {normalizedQuery === "" && (
        <div>
          <button
            type="button"
            role="checkbox"
            aria-checked={allMode}
            onClick={() => onChange([], allIds)}
            className={`flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left text-sm font-medium transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
              allMode ? "text-violet-900 dark:text-violet-100" : ""
            }`}
          >
            <span
              aria-hidden
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs transition-all ${circle[allMode ? "all" : "none"]}`}
            >
              {allMode && "✓"}
            </span>
            <span>すべて表示</span>
          </button>
          {allMode && (
            <p className="pb-2 pl-9 text-xs text-zinc-500 dark:text-zinc-400">
              事務所やVTuberをタップすると、そこだけに絞り込みます
            </p>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            該当するVTuberが見つかりません
          </p>
        ) : (
          visible.map((o) => {
            const ids = o.members.map((m) => m.channelId);
            const open = normalizedQuery !== "" || expanded.has(o.name);
            const officeState = allMode ? "all" : stateOf(ids, sel);
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
                    onClick={() => toggleOffice(ids, o.allMemberIds)}
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs transition-all hover:scale-105 ${circle[officeState]}`}
                  >
                    {officeState === "all" && "✓"}
                    {officeState === "some" && "−"}
                  </button>
                  {o.thumbnail ? (
                    <SafeImage
                      src={ytThumbUrl(o.thumbnail, 48)}
                      alt=""
                      variant="avatar"
                      loading="lazy"
                      className="size-6 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      {o.name === "個人" ? (
                        <User size={14} />
                      ) : (
                        <Building2 size={14} />
                      )}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleExpand(o.name)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm font-medium"
                  >
                    <span className="min-w-0 truncate">{o.name}</span>
                    <span className="shrink-0 text-xs text-zinc-500">
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
                          aria-checked={isSelected(m.channelId)}
                          onClick={() => toggleMember(m.channelId)}
                          className={`group flex w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-left text-sm transition ${
                            isSelected(m.channelId)
                              ? "border-violet-300 bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-900 shadow-sm shadow-violet-200/60 dark:border-violet-700 dark:from-violet-900/50 dark:to-fuchsia-900/40 dark:text-violet-100 dark:shadow-none"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-violet-300 hover:bg-violet-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-violet-700 dark:hover:bg-violet-950/30"
                          }`}
                        >
                          {thumbnails?.[m.channelId] ? (
                            <SafeImage
                              src={ytThumbUrl(thumbnails[m.channelId], 48)}
                              alt={`${m.name}のチャンネルアイコン`}
                              variant="avatar"
                              loading="lazy"
                              className={`size-6 shrink-0 rounded-full object-cover ${
                                isSelected(m.channelId)
                                  ? "ring-2 ring-white dark:ring-zinc-900"
                                  : ""
                              }`}
                            />
                          ) : (
                            <span
                              aria-hidden
                              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                                isSelected(m.channelId)
                                  ? "bg-white/80 text-violet-700 dark:bg-zinc-900/80 dark:text-violet-200"
                                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              {m.name.slice(0, 1)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate" title={m.name}>
                            {m.name}
                          </span>
                          <span
                            aria-hidden
                            className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] transition ${
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
