"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { adminApi } from "@/components/admin/api";
import { EditPanel } from "@/components/admin/EditPanel";
import { OfficeBoard, type BoardGroup } from "@/components/admin/OfficeBoard";
import { ExcludedList, PendingList } from "@/components/admin/PendingList";
import { ToastStack, useToasts } from "@/components/admin/Toasts";
import {
  OFFICE_KEY_RE,
  UNASSIGNED_OFFICE,
  type AdminBoardData,
  type AdminVtuber,
  type VtuberEdit,
} from "@/lib/admin/types";

type Tab = "board" | "pending" | "excluded";
type Filter = "all" | "auto" | "missing";

const REFLECT_NOTE = "公開サイトへの反映は最大 30 分後";

function byBoardOrder(a: AdminVtuber, b: AdminVtuber) {
  if (a.officeFlg !== b.officeFlg) return a.officeFlg ? -1 : 1;
  return (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0);
}

function readKeyFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("key");
}

function writeKeyToUrl(key: string | null) {
  const url = new URL(window.location.href);
  if (key) url.searchParams.set("key", key);
  else url.searchParams.delete("key");
  window.history.replaceState(null, "", url);
}

function AddOfficeDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (key: string, name: string) => Promise<boolean>;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const keyOk = OFFICE_KEY_RE.test(key);
  const input =
    "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!keyOk || !name.trim()) return;
          setBusy(true);
          if (await onSubmit(key, name.trim())) onClose();
          setBusy(false);
        }}
        className="w-full max-w-sm space-y-3 rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900"
      >
        <h2 className="font-bold">事務所を追加</h2>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-500">キー（英数字・-・_。後から変更不可）</span>
          <input autoFocus className={input} value={key} onChange={(e) => setKey(e.target.value)} placeholder="例: vspo_en" />
          {key && !keyOk && <span className="text-xs text-red-600">英数字・-・_ のみ</span>}
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-500">表示名</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="例: ぶいすぽっ！EN" />
        </label>
        <p className="text-xs text-zinc-500">メンバーが 1 人以上になると、30 分ジョブで掲示板スレッドが自動作成されます。</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            キャンセル
          </button>
          <button type="submit" disabled={busy || !keyOk || !name.trim()} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40">
            追加
          </button>
        </div>
      </form>
    </div>
  );
}

export function AdminApp() {
  const [data, setData] = useState<AdminBoardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("board");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [addingOffice, setAddingOffice] = useState(false);
  const dirtyRef = useRef(false);
  const { toasts, push, dismiss } = useToasts();

  const notify = useCallback(
    (message: string, kind: "info" | "error" = "info") => push({ message, kind }),
    [push],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminApi.board();
      setData(d);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // URL の ?key= で開いていた VTuber を復元
    setActiveKey(readKeyFromUrl());
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(new Set());
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  const byKey = useMemo(
    () => new Map((data?.vtubers ?? []).map((v) => [v.key, v])),
    [data],
  );
  // トーストの「元に戻す」は後から呼ばれるので、最新の状態を ref で参照する
  const byKeyRef = useRef(byKey);
  useEffect(() => {
    byKeyRef.current = byKey;
  }, [byKey]);
  const active = activeKey ? byKey.get(activeKey) ?? null : null;

  const openPanel = useCallback((key: string | null) => {
    if (dirtyRef.current && !window.confirm("保存していない変更があります。破棄しますか？")) return false;
    dirtyRef.current = false;
    setActiveKey(key);
    writeKeyToUrl(key);
    return true;
  }, []);

  /** サーバーから返った行で置き換える */
  const applyRows = useCallback((rows: AdminVtuber[]) => {
    setData((d) => {
      if (!d) return d;
      const map = new Map(rows.map((r) => [r.key, r]));
      const vtubers = d.vtubers.map((v) => map.get(v.key) ?? v);
      for (const r of rows) if (!d.vtubers.some((v) => v.key === r.key)) vtubers.push(r);
      return { ...d, vtubers };
    });
  }, []);

  const officeName = useCallback(
    (key: string) => data?.offices.find((o) => o.key === key)?.name ?? (key || "未分類"),
    [data],
  );

  /** 事務所の移動（楽観的更新 + 元に戻す） */
  const moveTo = useCallback(
    async (moves: { key: string; office: string }[], isUndo = false) => {
      const current = byKeyRef.current;
      const effective = moves.filter((m) => current.has(m.key) && current.get(m.key)?.office !== m.office);
      const prev = effective.map((m) => ({ key: m.key, office: current.get(m.key)?.office ?? "" }));
      if (effective.length === 0) return;
      const target = new Map(effective.map((m) => [m.key, m.office]));
      setData((d) =>
        d && {
          ...d,
          vtubers: d.vtubers.map((v) => (target.has(v.key) ? { ...v, office: target.get(v.key)! } : v)),
        },
      );
      try {
        const res = await adminApi.update(
          effective.map((m) => ({ key: m.key, fields: { office: m.office } })),
        );
        applyRows(res.updated);
        if (isUndo) {
          notify("元に戻しました");
          return;
        }
        const first = current.get(effective[0].key);
        const label =
          effective.length === 1
            ? `${first?.name ?? ""} を ${officeName(prev[0]?.office ?? "")} → ${officeName(effective[0].office)} に移動しました`
            : `${effective.length}人を ${officeName(effective[0].office)} に移動しました`;
        push({
          message: label,
          kind: "info",
          action: { label: "元に戻す", run: () => void moveTo(prev, true) },
        });
        setSelected(new Set());
      } catch (e) {
        // ロールバック
        const back = new Map(prev.map((p) => [p.key, p.office]));
        setData((d) =>
          d && {
            ...d,
            vtubers: d.vtubers.map((v) => (back.has(v.key) ? { ...v, office: back.get(v.key)! } : v)),
          },
        );
        notify(`移動に失敗しました: ${(e as Error).message}`, "error");
      }
    },
    [applyRows, notify, officeName, push],
  );

  const onCardClick = useCallback(
    (v: AdminVtuber, e: React.MouseEvent) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        setSelected((s) => {
          const next = new Set(s);
          if (next.has(v.key)) next.delete(v.key);
          else next.add(v.key);
          return next;
        });
        return;
      }
      setSelected(new Set());
      openPanel(v.key);
    },
    [openPanel],
  );

  const save = useCallback(
    async (key: string, fields: VtuberEdit) => {
      try {
        const res = await adminApi.update([{ key, fields }]);
        applyRows(res.updated);
        dirtyRef.current = false;
        notify(`保存しました（${REFLECT_NOTE}）`);
        return true;
      } catch (e) {
        notify(`保存に失敗しました: ${(e as Error).message}`, "error");
        return false;
      }
    },
    [applyRows, notify],
  );

  const remove = useCallback(
    async (v: AdminVtuber, reason: string) => {
      try {
        await adminApi.remove(v.key, reason);
        dirtyRef.current = false;
        setData((d) => d && { ...d, vtubers: d.vtubers.filter((x) => x.key !== v.key) });
        openPanel(null);
        notify(`${v.name} を削除し、除外リストに入れました`);
      } catch (e) {
        notify(`削除に失敗しました: ${(e as Error).message}`, "error");
      }
    },
    [notify, openPanel],
  );

  const renameOffice = useCallback(
    async (key: string, name: string) => {
      if (!name) return false;
      try {
        await adminApi.renameOffice(key, name);
        setData(
          (d) =>
            d && {
              ...d,
              offices: d.offices.map((o) => (o.key === key ? { ...o, name, needsNameReview: false } : o)),
            },
        );
        notify(`事務所名を「${name}」にしました`);
        return true;
      } catch (e) {
        notify((e as Error).message, "error");
        return false;
      }
    },
    [notify],
  );

  const addOffice = useCallback(
    async (key: string, name: string) => {
      try {
        await adminApi.addOffice(key, name);
        await load();
        notify(`事務所「${name}」を追加しました`);
        return true;
      } catch (e) {
        notify((e as Error).message, "error");
        return false;
      }
    },
    [load, notify],
  );

  const groups = useMemo<BoardGroup[]>(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const match = (v: AdminVtuber) => {
      if (filter === "auto" && v.registeredBy !== "auto-discovery") return false;
      if (filter === "missing" && (v.officeFlg || (v.birthday && v.debut))) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.channeID.toLowerCase().includes(q) ||
        v.twitterName.toLowerCase().includes(q)
      );
    };
    const known = new Set(data.offices.map((o) => o.key));
    const buckets = new Map<string, AdminVtuber[]>();
    for (const v of data.vtubers) {
      const k = known.has(v.office) ? v.office : UNASSIGNED_OFFICE;
      buckets.set(k, [...(buckets.get(k) ?? []), v]);
    }
    const result: BoardGroup[] = data.offices.map((office) => {
      const all = buckets.get(office.key) ?? [];
      return {
        office,
        total: all.length,
        members: all.filter(match).sort(byBoardOrder),
        droppable: true,
      };
    });
    const unassigned = buckets.get(UNASSIGNED_OFFICE) ?? [];
    if (unassigned.length && !known.has(UNASSIGNED_OFFICE)) {
      result.push({
        office: { key: UNASSIGNED_OFFICE, name: "未分類", needsNameReview: false, renamable: false },
        total: unassigned.length,
        members: unassigned.filter(match).sort(byBoardOrder),
        droppable: false,
      });
    }
    return result;
  }, [data, query, filter]);

  const shown = groups.reduce((n, g) => n + g.members.length, 0);

  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        tab === t ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-[65] border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <h1 className="mr-2 font-extrabold">VTuber 管理</h1>
          <nav className="flex gap-1">
            {tabBtn("board", "事務所ボード")}
            {tabBtn("pending", "保留中")}
            {tabBtn("excluded", "除外済み")}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              aria-label="再読み込み"
              className="rounded-md p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        {tab === "board" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-4 py-2 dark:border-zinc-900">
            <label className="relative">
              <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="名前・チャンネル ID・Twitter ID"
                className="w-72 rounded-md border border-zinc-300 bg-white py-1.5 pr-2 pl-8 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="all">すべて</option>
              <option value="auto">自動登録のみ</option>
              <option value="missing">誕生日・デビュー日が未入力</option>
            </select>
            <span className="text-sm text-zinc-500">
              {data ? `${shown} / ${data.vtubers.length}人` : ""}
            </span>
            {selected.size > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                {selected.size}人を選択中（ドラッグでまとめて移動）
                <button type="button" aria-label="選択解除" onClick={() => setSelected(new Set())}>
                  <X size={13} />
                </button>
              </span>
            )}
            <span className="hidden text-xs text-zinc-400 xl:inline">Shift / ⌘ クリックで複数選択</span>
            <button
              type="button"
              onClick={() => setAddingOffice(true)}
              className="ml-auto flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <Plus size={15} />
              事務所を追加
            </button>
          </div>
        )}
      </header>

      <main className={`p-4 ${active && tab === "board" ? "lg:pr-[436px]" : ""}`}>
        {loadError ? (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            読み込みに失敗しました: {loadError}
          </div>
        ) : !data ? (
          <p className="text-zinc-500">読み込み中…</p>
        ) : tab === "board" ? (
          <OfficeBoard
            groups={groups}
            subscribers={data.subscribers}
            selectedKeys={selected}
            activeKey={activeKey}
            onCardClick={onCardClick}
            onMove={(keys, office) => void moveTo(keys.map((key) => ({ key, office })))}
            onRename={renameOffice}
          />
        ) : tab === "pending" ? (
          <PendingList
            offices={data.offices}
            notify={notify}
            onRegistered={(v) => applyRows([v])}
          />
        ) : (
          <ExcludedList notify={notify} />
        )}
      </main>

      {active && tab === "board" && data && (
        <EditPanel
          key={`${active.key}:${active.office}:${active.updateTime}`}
          vtuber={active}
          offices={data.offices}
          allVtubers={data.vtubers}
          subscribers={data.subscribers[active.channeID]}
          onClose={() => openPanel(null)}
          onDirtyChange={(d) => {
            dirtyRef.current = d;
          }}
          onSave={(fields) => save(active.key, fields)}
          onDelete={(reason) => remove(active, reason)}
        />
      )}

      {addingOffice && <AddOfficeDialog onClose={() => setAddingOffice(false)} onSubmit={addOffice} />}
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
