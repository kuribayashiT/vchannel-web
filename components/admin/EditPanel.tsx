"use client";

import { useMemo, useState } from "react";
import { Bot, ExternalLink, Trash2, TriangleAlert, X } from "lucide-react";
import {
  BIRTHDAY_RE,
  DEBUT_RE,
  EDITABLE_FIELDS,
  normalizeBirthday,
  normalizeDebut,
  type AdminOffice,
  type AdminVtuber,
  type VtuberEdit,
} from "@/lib/admin/types";
import { formatNumber } from "@/lib/format";

type Form = Required<VtuberEdit>;

function toForm(v: AdminVtuber): Form {
  return {
    name: v.name,
    office: v.office,
    officeFlg: v.officeFlg,
    twitterName: v.twitterName,
    birthday: v.birthday,
    debut: v.debut,
    description: v.description,
  };
}

/** 変更のあるフィールドだけ返す */
export function diffForm(v: AdminVtuber, form: Form): VtuberEdit {
  const base = toForm(v);
  const out: Record<string, unknown> = {};
  for (const f of EDITABLE_FIELDS) {
    const a = form[f];
    const b = base[f];
    if (typeof a === "string" ? a.trim() !== String(b).trim() : a !== b) out[f] = a;
  }
  return out as VtuberEdit;
}

const input =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-zinc-700 dark:bg-zinc-950";

function Field({
  label,
  hint,
  error,
  note,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  /** 保存は止めない注意（黄色） */
  note?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-red-600">{error}</span>
      ) : note ? (
        <span className="block text-xs text-amber-600">{note}</span>
      ) : hint ? (
        <span className="block text-xs text-zinc-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function EditPanel({
  vtuber,
  offices,
  allVtubers,
  subscribers,
  onClose,
  onDirtyChange,
  onSave,
  onDelete,
}: {
  vtuber: AdminVtuber;
  offices: AdminOffice[];
  allVtubers: AdminVtuber[];
  subscribers: number | undefined;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (fields: VtuberEdit) => Promise<boolean>;
  onDelete: (reason: string) => Promise<void>;
}) {
  const [form, setForm] = useState<Form>(() => toForm(vtuber));
  const [saving, setSaving] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const changes = diffForm(vtuber, form);
  const dirty = Object.keys(changes).length > 0;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    const next = { ...form, [k]: v };
    setForm(next);
    onDirtyChange(Object.keys(diffForm(vtuber, next)).length > 0);
  };

  // 形式チェックは「編集した欄」だけ。既存の旧形式（05/15 など）は保存を止めず、注意だけ出す
  const dateState = (
    value: string,
    original: string,
    normalize: (s: string) => string | null,
    re: RegExp,
    format: string,
  ): { error: string | null; note: string | null } => {
    const v = value.trim();
    const n = normalize(v);
    if (v === original.trim()) {
      if (!v || v === "-" || re.test(v)) return { error: null, note: null };
      return {
        error: null,
        note: n ? `旧形式です。編集して保存すると ${n} になります` : `日付として読めない値です（${format}）`,
      };
    }
    if (n === null) return { error: `日付として読めません（${format}）`, note: null };
    return { error: null, note: n !== v ? `保存時に ${n || "空"} になります` : null };
  };
  const bday = dateState(form.birthday, vtuber.birthday, normalizeBirthday, BIRTHDAY_RE, "例 03-14");
  const debutState = dateState(form.debut, vtuber.debut, normalizeDebut, DEBUT_RE, "例 2021/08/01");
  const birthdayErr = bday.error;
  const debutErr = debutState.error;
  const nameErr = form.name.trim() ? null : "必須";

  const twitterDup = useMemo(() => {
    const t = form.twitterName.trim().replace(/^@+/, "").toLowerCase();
    if (!t) return [];
    return allVtubers.filter((x) => x.key !== vtuber.key && x.twitterName.toLowerCase() === t);
  }, [form.twitterName, allVtubers, vtuber.key]);

  const officeKnown = offices.some((o) => o.key === form.office);
  const canSave = dirty && !saving && !birthdayErr && !debutErr && !nameErr;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await onSave(changes);
    setSaving(false);
    if (ok) onDirtyChange(false);
  };

  return (
    <aside
      aria-label="VTuber の編集"
      className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[420px] flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
    >
      <header className="flex items-center gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
        {vtuber.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vtuber.thumbnailUrl} alt="" className="size-12 rounded-full object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate font-bold">
            {vtuber.name}
            {vtuber.registeredBy === "auto-discovery" && (
              <Bot size={15} className="text-sky-600" aria-label="自動登録" />
            )}
          </p>
          <p className="text-xs text-zinc-500">
            key {vtuber.key}
            {subscribers ? ` ・ 登録者 ${formatNumber(subscribers)}人` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="閉じる" className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <X size={18} />
        </button>
      </header>

      <form
        className="flex-1 space-y-4 overflow-y-auto p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="名前" error={nameErr}>
          <input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>

        <Field label="事務所" hint="ボードでカードを別の事務所へドラッグしても変更できます">
          <select className={input} value={form.office} onChange={(e) => set("office", e.target.value)}>
            {!officeKnown && <option value={form.office}>（未分類: {form.office || "空"}）</option>}
            {offices.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
                {o.name !== o.key ? `（${o.key}）` : ""}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.officeFlg}
            onChange={(e) => set("officeFlg", e.target.checked)}
            className="size-4"
          />
          事務所公式アカウント（一覧の先頭に出る）
        </label>

        <Field label="Twitter ID" hint="@ なし">
          <input className={input} value={form.twitterName} onChange={(e) => set("twitterName", e.target.value)} />
          {twitterDup.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <TriangleAlert size={12} />
              {twitterDup.map((x) => x.name).join("、")} と重複しています
            </span>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="誕生日"
            error={birthdayErr}
            note={bday.note}
            hint={vtuber.profileSource?.birthday ? `出典 ${vtuber.profileSource.birthday}` : "MM-DD（不明で確定なら -）"}
          >
            <input className={input} placeholder="MM-DD" value={form.birthday} onChange={(e) => set("birthday", e.target.value)} />
          </Field>
          <Field
            label="デビュー日"
            error={debutErr}
            note={debutState.note}
            hint={vtuber.profileSource?.debut ? `出典 ${vtuber.profileSource.debut}` : "YYYY/MM/DD"}
          >
            <input className={input} placeholder="YYYY/MM/DD" value={form.debut} onChange={(e) => set("debut", e.target.value)} />
          </Field>
        </div>

        <Field label="概要">
          <textarea
            className={`${input} min-h-28 font-normal`}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <dl className="space-y-1.5 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">チャンネル</dt>
            <dd className="min-w-0 break-all font-mono">{vtuber.channeID || "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">登録</dt>
            <dd>
              {vtuber.createdAt ? new Date(vtuber.createdAt).toLocaleString("ja-JP") : "—"}
              {vtuber.registeredBy ? `（${vtuber.registeredBy}）` : ""}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">更新</dt>
            <dd>{vtuber.updateTime ? new Date(vtuber.updateTime).toLocaleString("ja-JP") : "—"}</dd>
          </div>
          {vtuber.discovery && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-zinc-500">自動登録の根拠</dt>
              <dd className="min-w-0 break-all font-mono">
                {Object.entries(vtuber.discovery)
                  .filter(([, v]) => v !== "" && v !== false && v != null)
                  .map(([k, v]) => `${k}: ${String(v)}`)
                  .join(" / ")}
              </dd>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            {vtuber.channeID && (
              <>
                <a
                  href={`https://www.youtube.com/channel/${vtuber.channeID}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-0.5 text-blue-600 hover:underline dark:text-blue-400"
                >
                  YouTube <ExternalLink size={11} />
                </a>
                <a
                  href={`/vtuber/${vtuber.channeID}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-0.5 text-blue-600 hover:underline dark:text-blue-400"
                >
                  公開ページ <ExternalLink size={11} />
                </a>
              </>
            )}
          </div>
        </dl>

        <div className="rounded-lg border border-red-200 p-3 dark:border-red-900/60">
          {!showDelete ? (
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-1 text-sm text-red-600"
            >
              <Trash2 size={14} />
              この VTuber を削除
            </button>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-red-600">
                削除すると自動登録の除外リストに入り、再登録されません（「除外済み」タブで解除できます）。確認のため名前を入力してください。
              </p>
              <input className={input} placeholder={vtuber.name} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
              <input className={input} placeholder="理由（任意）例: 切り抜きチャンネル" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={confirmName.trim() !== vtuber.name.trim()}
                  onClick={() => void onDelete(reason)}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-white disabled:opacity-40"
                >
                  削除する
                </button>
                <button type="button" onClick={() => setShowDelete(false)} className="rounded-md px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  やめる
                </button>
              </div>
            </div>
          )}
        </div>
      </form>

      <footer className="flex items-center gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <span className="flex-1 text-xs text-zinc-500">
          {dirty ? `${Object.keys(changes).length} 項目を変更中` : "変更なし"}
        </span>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => {
            setForm(toForm(vtuber));
            onDirtyChange(false);
          }}
          className="rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800"
        >
          元に戻す
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void save()}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </footer>
    </aside>
  );
}
