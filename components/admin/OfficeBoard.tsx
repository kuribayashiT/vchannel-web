"use client";

import { memo, useState } from "react";
import { Bot, Check, Pencil, TriangleAlert, X } from "lucide-react";
import { formatCompact } from "@/lib/format";
import type { AdminOffice, AdminVtuber } from "@/lib/admin/types";

export interface BoardGroup {
  office: AdminOffice;
  members: AdminVtuber[];
  /** 検索・絞り込み前の人数 */
  total: number;
  droppable: boolean;
}

const DRAG_MIME = "application/x-vchannel-keys";

function sectionId(key: string) {
  return `office-${encodeURIComponent(key)}`;
}

/** ドロップ先（サイドバーの行・セクション本体）共通のハンドラ */
function useDropTarget(enabled: boolean, onDrop: () => void) {
  const [over, setOver] = useState(false);
  if (!enabled) return { over: false, props: {} };
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        onDrop();
      },
    },
  };
}

function SidebarItem({
  group,
  onDrop,
}: {
  group: BoardGroup;
  onDrop: (officeKey: string) => void;
}) {
  const { over, props } = useDropTarget(group.droppable, () => onDrop(group.office.key));
  return (
    <li {...props}>
      <a
        href={`#${sectionId(group.office.key)}`}
        className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition ${
          over
            ? "bg-blue-600 text-white"
            : "hover:bg-zinc-200/70 dark:hover:bg-zinc-800"
        } ${group.members.length === 0 ? "opacity-50" : ""}`}
      >
        <span className="min-w-0 flex-1 truncate">{group.office.name}</span>
        {group.office.needsNameReview && (
          <TriangleAlert size={13} className={over ? "" : "text-amber-500"} aria-label="名前未確認" />
        )}
        <span className={`text-xs tabular-nums ${over ? "" : "text-zinc-500"}`}>
          {group.members.length === group.total
            ? group.total
            : `${group.members.length}/${group.total}`}
        </span>
      </a>
    </li>
  );
}

const VtuberCard = memo(function VtuberCard({
  v,
  subscribers,
  selected,
  active,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  v: AdminVtuber;
  subscribers: number | undefined;
  selected: boolean;
  active: boolean;
  onClick: (v: AdminVtuber, e: React.MouseEvent) => void;
  onDragStart: (v: AdminVtuber, e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const auto = v.registeredBy === "auto-discovery";
  const missing = [!v.birthday && "誕生日", !v.debut && "デビュー"].filter(Boolean);
  return (
    <button
      type="button"
      draggable
      onClick={(e) => onClick(v, e)}
      onDragStart={(e) => onDragStart(v, e)}
      onDragEnd={onDragEnd}
      className={`flex w-full cursor-grab items-center gap-2 rounded-lg border bg-white p-2 text-left transition active:cursor-grabbing dark:bg-zinc-900 ${
        active
          ? "border-blue-600 ring-2 ring-blue-600/40"
          : selected
            ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500/30 dark:bg-violet-950/40"
            : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
      }`}
    >
      {v.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={v.thumbnailUrl}
          alt=""
          loading="lazy"
          draggable={false}
          className="size-9 shrink-0 rounded-full bg-zinc-200 object-cover dark:bg-zinc-800"
        />
      ) : (
        <span className="size-9 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-sm font-medium">{v.name || "(名前なし)"}</span>
          {auto && <Bot size={13} className="shrink-0 text-sky-600" aria-label="自動登録" />}
        </span>
        <span className="flex flex-wrap items-center gap-1 text-[11px] text-zinc-500">
          {subscribers ? <span className="tabular-nums">{formatCompact(subscribers)}人</span> : null}
          {v.officeFlg && (
            <span className="rounded bg-zinc-800 px-1 text-white dark:bg-zinc-200 dark:text-zinc-900">公式</span>
          )}
          {!v.officeFlg && missing.length > 0 && (
            <span className="rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              {missing.join("・")}なし
            </span>
          )}
        </span>
      </span>
    </button>
  );
});

function OfficeSection({
  group,
  subscribers,
  selectedKeys,
  activeKey,
  onCardClick,
  onDragStart,
  onDragEnd,
  onDrop,
  onRename,
}: {
  group: BoardGroup;
  subscribers: Record<string, number>;
  selectedKeys: Set<string>;
  activeKey: string | null;
  onCardClick: (v: AdminVtuber, e: React.MouseEvent) => void;
  onDragStart: (v: AdminVtuber, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (officeKey: string) => void;
  onRename: (key: string, name: string) => Promise<boolean>;
}) {
  const { office, members } = group;
  const { over, props } = useDropTarget(group.droppable, () => onDrop(office.key));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(office.name);

  const save = async () => {
    if (await onRename(office.key, name.trim())) setEditing(false);
  };

  return (
    <section
      id={sectionId(office.key)}
      {...props}
      className={`scroll-mt-28 rounded-xl border p-3 transition ${
        over
          ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
          : "border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40"
      }`}
    >
      <header className="mb-2 flex items-center gap-2">
        {editing ? (
          <form
            className="flex flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button type="submit" aria-label="保存" className="rounded p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-950">
              <Check size={16} />
            </button>
            <button type="button" aria-label="キャンセル" onClick={() => setEditing(false)} className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800">
              <X size={16} />
            </button>
          </form>
        ) : (
          <>
            <h2 className="font-bold">{office.name}</h2>
            <span className="font-mono text-xs text-zinc-400">{office.key}</span>
            {office.needsNameReview && (
              <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                <TriangleAlert size={12} />
                名前未確認
              </span>
            )}
            <span className="text-sm text-zinc-500">{members.length}人</span>
            {office.renamable && group.droppable && (
              <button
                type="button"
                aria-label="事務所名を変更"
                onClick={() => {
                  setName(office.name);
                  setEditing(true);
                }}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              >
                <Pencil size={14} />
              </button>
            )}
          </>
        )}
      </header>
      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 py-4 text-center text-sm text-zinc-400 dark:border-zinc-700">
          {group.droppable ? "ここにドロップして移動" : "該当なし"}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-1.5">
          {members.map((v) => (
            <VtuberCard
              key={v.key}
              v={v}
              subscribers={subscribers[v.channeID]}
              selected={selectedKeys.has(v.key)}
              active={activeKey === v.key}
              onClick={onCardClick}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function OfficeBoard({
  groups,
  subscribers,
  selectedKeys,
  activeKey,
  onCardClick,
  onMove,
  onRename,
}: {
  groups: BoardGroup[];
  subscribers: Record<string, number>;
  selectedKeys: Set<string>;
  activeKey: string | null;
  onCardClick: (v: AdminVtuber, e: React.MouseEvent) => void;
  onMove: (keys: string[], officeKey: string) => void;
  onRename: (key: string, name: string) => Promise<boolean>;
}) {
  const [dragKeys, setDragKeys] = useState<string[] | null>(null);

  const onDragStart = (v: AdminVtuber, e: React.DragEvent) => {
    const keys = selectedKeys.has(v.key) ? [...selectedKeys] : [v.key];
    setDragKeys(keys);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(keys));
    e.dataTransfer.setData("text/plain", v.name);
  };
  const onDragEnd = () => setDragKeys(null);
  const onDrop = (officeKey: string) => {
    if (dragKeys?.length) onMove(dragKeys, officeKey);
    setDragKeys(null);
  };

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <nav
        aria-label="事務所"
        className="sticky top-[104px] hidden max-h-[calc(100vh-120px)] w-52 shrink-0 self-start overflow-y-auto pr-1 lg:block"
      >
        {/* ドラッグ開始で文言が変わっても行がずれないよう高さを固定 */}
        <p className="mb-1 h-8 overflow-hidden px-2 text-xs leading-4 text-zinc-500">
          {dragKeys ? `${dragKeys.length}人を移動先へドロップ` : "クリックで移動 / ドロップで所属変更"}
        </p>
        <ul className="space-y-0.5">
          {groups.map((g) => (
            <SidebarItem key={g.office.key} group={g} onDrop={onDrop} />
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1 space-y-3 pb-24">
        {groups
          // 検索・絞り込みで 0 件になった事務所は隠す（もともと 0 人の事務所はドロップ先として出す）
          .filter((g) => g.members.length > 0 || g.total === 0)
          .map((g) => (
            <OfficeSection
              key={g.office.key}
              group={g}
              subscribers={subscribers}
              selectedKeys={selectedKeys}
              activeKey={activeKey}
              onCardClick={onCardClick}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
              onRename={onRename}
            />
          ))}
      </div>
    </div>
  );
}
