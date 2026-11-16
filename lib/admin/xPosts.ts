import { eventLabel, formatDateSlug } from "@/lib/events";
import { formatCompact, formatNumber } from "@/lib/format";
import type { SubscriberGrowthItem, VEvent } from "@/types";

/**
 * 管理画面「X 投稿案」（/admin/x）の文面を作る純粋関数。FRONTEND_SPEC.md 5.12.1
 * X API は使わず、投稿は運営者が X の投稿画面（intent）から手で行う。
 */

export type XPostKind = "birthday" | "anniversary" | "person" | "growth" | "milestone";

export interface XPostDraft {
  id: string;
  kind: XPostKind;
  /** 管理画面での見出し */
  label: string;
  /** URL を含む投稿本文 */
  text: string;
  /** 本文に含めたサイトの URL（確認用） */
  url: string;
}

export interface XPostInput {
  siteUrl: string;
  month: number;
  day: number;
  year: number;
  events: VEvent[];
  /** channelId → 登録者数（イベントの並び替え・表示用） */
  subscribers: Map<string, number>;
  weekGrowth: { from: string; to: string; items: SubscriberGrowthItem[] };
}

const UTM = "utm_source=x&utm_medium=social";
const MAX_NAMES = 4;
const MAX_PERSON_POSTS = 3;
const GROWTH_TOP = 5;
const MAX_MILESTONES = 5;
/** 個別の誕生日投稿を作る登録者数の下限（小さいチャンネルは反応が見込めないため） */
const PERSON_MIN_SUBSCRIBERS = 10_000;

/** 突破を祝う登録者数の節目 */
export const MILESTONES = [
  100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 700_000, 800_000, 900_000,
  1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 3_500_000, 4_000_000,
  4_500_000, 5_000_000,
];

function withUtm(siteUrl: string, path: string): string {
  return `${siteUrl}${path}${path.includes("?") ? "&" : "?"}${UTM}`;
}

/**
 * 投稿用の短い名前。チャンネル名の飾り（【事務所】、Ch. / Channel / チャンネル、hololive など）を外し、
 * 「英語名 / 日本語名」のような併記は日本語を含む側を使う。
 */
export function displayName(raw: string): string {
  const JA = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
  const stripped = raw.replace(/[【〖『\[][^】〗』\]]*[】〗』\]]/g, " ");
  // 「/」や「Ch.」「Channel」を区切りとして分け、日本語を含む部分を優先する
  const parts = stripped
    .split(/\s*(?:[/／|｜]|(?:Official\s+)?(?:Ch\.|\bCh\b|Channel))\s*/i)
    .map((x) => x.trim())
    .filter(Boolean);
  let n = parts.find((x) => JA.test(x)) ?? parts[0] ?? "";
  n = n
    // 「名前 - 事務所」「名前 -Romaji-」の後ろを外す
    .replace(/^(.+?)\s+[-‐–—].*$/u, "$1")
    // 日本語名の後ろのローマ字表記（「幽音しの Shino」「熊谷タクマKumagaya Takuma」）を外す
    .replace(/^(.*[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー])\s*[A-Za-z][A-Za-z .']*$/u, "$1")
    .replace(/(.{2,})チャンネル$/u, "$1")
    .replace(/\s+(hololive(\s+\w+)?|にじさんじ)$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
  return n || raw.trim();
}

/** X のハッシュタグに使える名前だけタグにする（空白・記号を含む名前は使わない） */
function nameTag(name: string): string | null {
  const n = name.trim();
  return /^[\p{L}\p{N}_ー]+$/u.test(n) ? `#${n}` : null;
}

function joinNames(names: string[]): string {
  const shown = names.slice(0, MAX_NAMES).map((n) => `${displayName(n)}さん`);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join("、")}ほか${rest}人` : shown.join("、");
}

function mmdd(ymd: string): string {
  return `${Number(ymd.slice(4, 6))}/${Number(ymd.slice(6, 8))}`;
}

/** 登録者数の多い順。同数・不明はデータの並び順を保つ */
function bySubscribers(events: VEvent[], subs: Map<string, number>): VEvent[] {
  return events
    .map((e, i) => ({ e, i, n: subs.get(e.channelId) ?? -1 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.e);
}

function uniqueByChannel(events: VEvent[]): VEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => (seen.has(e.channelId) ? false : (seen.add(e.channelId), true)));
}

export function crossedMilestone(item: SubscriberGrowthItem): number | null {
  const before = item.current - item.growth;
  let hit: number | null = null;
  for (const m of MILESTONES) {
    if (before < m && item.current >= m) hit = m;
  }
  return hit;
}

export function buildXPostDrafts(input: XPostInput): XPostDraft[] {
  const { siteUrl, month, day, year, subscribers } = input;
  const slug = formatDateSlug(month, day);
  const dateUrl = withUtm(siteUrl, `/events/${slug}`);
  const drafts: XPostDraft[] = [];

  const birthdays = bySubscribers(
    uniqueByChannel(input.events.filter((e) => e.eventType === "birthday")),
    subscribers,
  );
  const anniversaries = bySubscribers(
    uniqueByChannel(input.events.filter((e) => e.eventType === "createAt")),
    subscribers,
  ).filter((e) => /周年$/.test(eventLabel(e, year)));

  if (birthdays.length > 0) {
    drafts.push({
      id: `birthday-${slug}`,
      kind: "birthday",
      label: `誕生日まとめ（${birthdays.length}人）`,
      text: [
        `🎂 今日${month}月${day}日は ${joinNames(birthdays.map((e) => e.name))} の誕生日です！おめでとうございます🎉`,
        "",
        "今日が誕生日・デビュー記念日のVTuberはこちら👇",
        dateUrl,
        "",
        "#VTuber #誕生日",
      ].join("\n"),
      url: dateUrl,
    });
  }

  if (anniversaries.length > 0) {
    const list = anniversaries
      .slice(0, MAX_NAMES)
      .map((e) => `・${displayName(e.name)}さん（${eventLabel(e, year)}）`);
    const rest = anniversaries.length - list.length;
    drafts.push({
      id: `anniversary-${slug}`,
      kind: "anniversary",
      label: `デビュー記念日まとめ（${anniversaries.length}人）`,
      text: [
        `🎊 今日${month}月${day}日はデビュー記念日！`,
        ...list,
        ...(rest > 0 ? [`ほか${rest}人`] : []),
        "",
        dateUrl,
        "",
        "#VTuber #デビュー記念日",
      ].join("\n"),
      url: dateUrl,
    });
  }

  const people = birthdays
    .filter((e) => (subscribers.get(e.channelId) ?? 0) >= PERSON_MIN_SUBSCRIBERS)
    .slice(0, MAX_PERSON_POSTS);
  for (const e of people) {
    const name = displayName(e.name);
    const url = withUtm(siteUrl, `/vtuber/${e.channelId}`);
    const subs = subscribers.get(e.channelId);
    const office = e.office && e.office !== "個人" ? `（${e.office}）` : "";
    const tags = ["#VTuber", nameTag(name)].filter(Boolean).join(" ");
    drafts.push({
      id: `person-${e.channelId}`,
      kind: "person",
      label: `誕生日: ${name}`,
      text: [
        `🎂 今日は ${name}さん${office}の誕生日！おめでとうございます🎉`,
        ...(subs ? [`YouTube登録者数は${formatCompact(subs)}人。`] : []),
        "登録者数の推移と最新動画はこちら👇",
        url,
        "",
        tags,
      ].join("\n"),
      url,
    });
  }

  const growth = input.weekGrowth;
  const top = growth.items.slice(0, GROWTH_TOP);
  if (top.length > 0) {
    const url = withUtm(siteUrl, "/ranking?tab=growth");
    drafts.push({
      id: `growth-${growth.to}`,
      kind: "growth",
      label: `週間 登録者急上昇 TOP${top.length}`,
      text: [
        `📈 今週の登録者数 急上昇TOP${top.length}（${mmdd(growth.from)}〜${mmdd(growth.to)}）`,
        ...top.map((it, i) => `${i + 1}. ${displayName(it.name)} +${formatNumber(it.growth)}人`),
        "",
        url,
        "",
        "#VTuber",
      ].join("\n"),
      url,
    });
  }

  const milestones = growth.items
    .map((it) => ({ it, m: crossedMilestone(it) }))
    .filter((x): x is { it: SubscriberGrowthItem; m: number } => x.m !== null)
    .sort((a, b) => b.m - a.m)
    .slice(0, MAX_MILESTONES);
  for (const { it, m } of milestones) {
    const name = displayName(it.name);
    const url = withUtm(siteUrl, `/vtuber/${it.channelId}`);
    const office = it.office && it.office !== "個人" ? `（${it.office}）` : "";
    const tags = ["#VTuber", nameTag(name)].filter(Boolean).join(" ");
    drafts.push({
      id: `milestone-${it.channelId}-${m}`,
      kind: "milestone",
      label: `${formatCompact(m)}人突破: ${name}`,
      text: [
        `🎉 ${name}さん${office}がYouTube登録者数${formatCompact(m)}人を突破しました！おめでとうございます！`,
        `この1週間で+${formatNumber(it.growth)}人。`,
        url,
        "",
        tags,
      ].join("\n"),
      url,
    });
  }

  return drafts;
}

/** X の文字数（日本語などは 2、URL は 23 として数える。上限 280） */
export function xWeightedLength(text: string): number {
  const urlRe = /https?:\/\/\S+/g;
  let n = 0;
  const rest = text.replace(urlRe, () => {
    n += 23;
    return "";
  });
  for (const ch of rest) {
    const c = ch.codePointAt(0) ?? 0;
    const light =
      c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247);
    n += light ? 1 : 2;
  }
  return n;
}

export const X_MAX_LENGTH = 280;

export function xIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
