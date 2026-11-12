"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { adminApi } from "@/components/admin/api";
import { formatNumber } from "@/lib/format";
import {
  PENDING_REASON_LABELS,
  type AdminOffice,
  type AdminVtuber,
  type ExcludedEntry,
  type PendingCandidate,
} from "@/lib/admin/types";

const cell = "px-3 py-2 align-middle";
const select =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";

type Notify = (message: string, kind?: "info" | "error") => void;

function PendingRow({
  c,
  offices,
  onDone,
  notify,
}: {
  c: PendingCandidate;
  offices: AdminOffice[];
  onDone: (registered?: AdminVtuber) => void;
  notify: Notify;
}) {
  const [office, setOffice] = useState(offices.some((o) => o.key === c.officeKey) ? c.officeKey : "");
  const [officeFlg, setOfficeFlg] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action: "register" | "reject") => {
    setBusy(true);
    try {
      const res = await adminApi.resolvePending(
        c.channelId,
        action === "register" ? { action, officeKey: office, officeFlg } : { action },
      );
      notify(action === "register" ? `${c.name} を登録しました` : `${c.name} を除外リストに入れました`);
      onDone(res.vtuber);
    } catch (e) {
      notify((e as Error).message, "error");
      setBusy(false);
    }
  };

  return (
    <tr className="border-t border-zinc-200 dark:border-zinc-800">
      <td className={cell}>
        <div className="flex items-center gap-2">
          {c.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.thumbnailUrl} alt="" loading="lazy" className="size-8 rounded-full" />
          )}
          <a
            href={`https://www.youtube.com/channel/${c.channelId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-0.5 font-medium hover:underline"
          >
            {c.name} <ExternalLink size={11} className="text-zinc-400" />
          </a>
        </div>
      </td>
      <td className={`${cell} text-right tabular-nums`}>{formatNumber(c.subscribers)}</td>
      <td className={`${cell} text-zinc-500`}>{c.org || "—"}</td>
      <td className={cell}>
        <ul className="space-y-0.5 text-xs">
          {c.reasons.map((r) => (
            <li key={r}>{PENDING_REASON_LABELS[r] ?? r}</li>
          ))}
        </ul>
      </td>
      <td className={cell}>
        <div className="flex flex-col gap-1">
          <select className={select} value={office} onChange={(e) => setOffice(e.target.value)}>
            <option value="">事務所を選択</option>
            {offices.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={officeFlg} onChange={(e) => setOfficeFlg(e.target.checked)} />
            公式アカウント
          </label>
        </div>
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        <button
          type="button"
          disabled={busy || !office}
          onClick={() => void run("register")}
          className="mr-1 rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40"
        >
          登録
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("reject")}
          className="rounded-md px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/40"
        >
          却下
        </button>
      </td>
    </tr>
  );
}

export function PendingList({
  offices,
  onRegistered,
  notify,
}: {
  offices: AdminOffice[];
  onRegistered: (v: AdminVtuber) => void;
  notify: Notify;
}) {
  const [list, setList] = useState<PendingCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .pending()
      .then((r) => setList(r.pending))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!list) return <p className="text-zinc-500">読み込み中…</p>;
  if (list.length === 0) return <p className="text-zinc-500">保留中の候補はありません。</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <p className="px-3 pt-3 text-xs text-zinc-500">
        自動登録が判断を保留したチャンネルです（毎日 0:30 の実行で作り直されます）。却下すると除外リストに入り、以後候補に出ません。
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className={cell}>チャンネル</th>
            <th className={`${cell} text-right`}>登録者</th>
            <th className={cell}>Holodex org</th>
            <th className={cell}>保留理由</th>
            <th className={cell}>所属</th>
            <th className={cell} />
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <PendingRow
              key={c.channelId}
              c={c}
              offices={offices}
              notify={notify}
              onDone={(v) => {
                setList((l) => l?.filter((x) => x.channelId !== c.channelId) ?? null);
                if (v) onRegistered(v);
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExcludedList({ notify }: { notify: Notify }) {
  const [list, setList] = useState<ExcludedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .excluded()
      .then((r) => setList(r.excluded))
      .catch((e: Error) => setError(e.message));
  }, []);

  const unexclude = async (x: ExcludedEntry) => {
    try {
      await adminApi.unexclude(x.channelId);
      setList((l) => l?.filter((y) => y.channelId !== x.channelId) ?? null);
      notify(`${x.name} の除外を解除しました（再登録は翌日以降の自動登録まかせ）`);
    } catch (e) {
      notify((e as Error).message, "error");
    }
  };

  if (error) return <p className="text-red-600">{error}</p>;
  if (!list) return <p className="text-zinc-500">読み込み中…</p>;
  if (list.length === 0) return <p className="text-zinc-500">除外済みのチャンネルはありません。</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className={cell}>名前</th>
            <th className={cell}>チャンネル ID</th>
            <th className={cell}>日時</th>
            <th className={cell}>理由</th>
            <th className={cell} />
          </tr>
        </thead>
        <tbody>
          {list.map((x) => (
            <tr key={x.channelId} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className={`${cell} font-medium`}>{x.name}</td>
              <td className={`${cell} font-mono text-xs`}>
                <a href={`https://www.youtube.com/channel/${x.channelId}`} target="_blank" rel="noreferrer" className="hover:underline">
                  {x.channelId}
                </a>
              </td>
              <td className={`${cell} whitespace-nowrap text-zinc-500`}>
                {x.at ? new Date(x.at).toLocaleString("ja-JP") : "—"}
              </td>
              <td className={cell}>{x.reason || "—"}</td>
              <td className={cell}>
                <button type="button" onClick={() => void unexclude(x)} className="rounded-md px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40">
                  除外を解除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
