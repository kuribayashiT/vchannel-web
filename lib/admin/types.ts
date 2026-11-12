/**
 * 管理画面（/admin）で使う型と入力チェック。クライアント・サーバー共用。
 * 仕様: FRONTEND_SPEC.md 5.12
 */

export const PERSONAL_OFFICE = "personal";
/** `office` が空・未知の VTuber をまとめる表示用の箱（実在の事務所キーではない） */
export const UNASSIGNED_OFFICE = "other";

export interface AdminVtuber {
  /** RTDB `vtuber/{key}` のキー */
  key: string;
  name: string;
  channeID: string;
  office: string;
  officeFlg: boolean;
  twitterName: string;
  birthday: string;
  debut: string;
  description: string;
  thumbnailUrl: string;
  createdAt: string;
  updateTime: string;
  registeredBy: string;
  discovery: Record<string, unknown> | null;
  profileSource: Record<string, string> | null;
}

export interface AdminOffice {
  key: string;
  name: string;
  /** 自動作成された事務所で、表示名がまだ英語のまま */
  needsNameReview: boolean;
  /** RTDB のキーに使える（= 表示名を officeMapping に保存できる） */
  renamable: boolean;
}

export interface AdminBoardData {
  vtubers: AdminVtuber[];
  offices: AdminOffice[];
  /** channelId → 登録者数（officedataList.json 由来。取れなければ空） */
  subscribers: Record<string, number>;
}

export interface PendingCandidate {
  channelId: string;
  name: string;
  org: string;
  officeKey: string;
  subscribers: number;
  twitter: string;
  thumbnailUrl: string;
  reasons: string[];
  lastSeenAt: string;
}

export interface ExcludedEntry {
  channelId: string;
  name: string;
  at: string;
  reason: string;
}

export const EDITABLE_FIELDS = [
  "name",
  "office",
  "officeFlg",
  "twitterName",
  "birthday",
  "debut",
  "description",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type VtuberEdit = Partial<Pick<AdminVtuber, EditableField>>;

export interface VtuberChange {
  key: string;
  fields: VtuberEdit;
}

export const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const DEBUT_RE = /^\d{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/;
/** 新規事務所キー */
export const OFFICE_KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;
/** RTDB のキーに使えない文字を含まない */
export const RTDB_KEY_RE = /^[^.#$[\]/]{1,200}$/;

export const MAX_TEXT = 5000;

function validMonthDay(month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 誕生日を保存形式 "MM-DD" にそろえる。backend-repo/functions/eventList.js の
 * normalizeBirthday と同じ解釈（MM/DD・M/D・YYYY-MM-DD・M月D日・MMDD・"-"=不明で確定）。
 * 解釈できなければ null。
 */
export function normalizeBirthday(raw: string): string | null {
  const s = raw.trim();
  if (s === "" || s === "-") return s;
  const m =
    /^(?:\d{4}[-/.])?(\d{1,2})[-/.](\d{1,2})$/.exec(s) ??
    /^(?:\d{4}年)?\s*(\d{1,2})月\s*(\d{1,2})日$/.exec(s) ??
    /^(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return validMonthDay(month, day) ? `${pad2(month)}-${pad2(day)}` : null;
}

/** デビュー日を保存形式 "YYYY/MM/DD" にそろえる（YYYY/M/D・YYYY-MM-DD・YYYY年M月D日 可）。解釈できなければ null */
export function normalizeDebut(raw: string): string | null {
  const s = raw.trim();
  if (s === "") return "";
  const m = /^(\d{4})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})日?$/.exec(s);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return validMonthDay(month, day) ? `${m[1]}/${pad2(month)}/${pad2(day)}` : null;
}

/** 1 フィールド分の正規化。不正なら Error を投げる */
export function normalizeField(
  field: EditableField,
  value: unknown,
): string | boolean {
  if (field === "officeFlg") {
    if (typeof value !== "boolean") throw new Error("officeFlg は true/false");
    return value;
  }
  if (typeof value !== "string") throw new Error(`${field} は文字列`);
  let v = value.trim();
  if (v.length > MAX_TEXT) throw new Error(`${field} が長すぎます`);
  switch (field) {
    case "name":
      if (!v) throw new Error("名前は必須です");
      break;
    case "office":
      if (!v) throw new Error("事務所は必須です");
      break;
    case "twitterName":
      v = v.replace(/^@+/, "");
      break;
    case "birthday": {
      const n = normalizeBirthday(v);
      if (n === null) throw new Error("誕生日を日付として読めません（MM-DD 形式）");
      v = n;
      break;
    }
    case "debut": {
      const n = normalizeDebut(v);
      if (n === null) throw new Error("デビュー日を日付として読めません（YYYY/MM/DD 形式）");
      v = n;
      break;
    }
    case "description":
      v = value.replace(/\s+$/, "");
      break;
  }
  return v;
}

export const PENDING_REASON_LABELS: Record<string, string> = {
  no_verification_signal: "VTuber である根拠なし",
  twitter_duplicate: "Twitter ID が登録済みと重複",
  sub_channel_of_registered: "登録済み VTuber のサブチャンネル",
  clip_channel: "切り抜き・まとめ・翻訳っぽい名前",
  official_without_office: "個人勢なのに「公式」",
  new_office_too_few_members: "未知の事務所でメンバー 1 人",
};
