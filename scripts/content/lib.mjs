// 記事の自動作成（月報コメント・週刊特集）で共通に使う部品。FRONTEND_SPEC.md 5.12.2 / 5.12.3
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

// ---------- 日付 ----------

/** JST の今日 YYYY-MM-DD */
export function todayJst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------- 材料の取得 ----------

/** ビルドしたサイトの /api/admin/* から JSON を取る。404 は null */
export async function fetchAdminJson(baseUrl, pathAndQuery) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) throw new Error("ADMIN_USER / ADMIN_PASSWORD が未設定です");
  const auth = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  const res = await fetch(`${baseUrl}${pathAndQuery}`, {
    headers: { authorization: `Basic ${auth}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${pathAndQuery} の取得に失敗: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

// ---------- 数字の検査 ----------

/** 材料に出てくる数字（数値フィールドと、文字列中の数字）を全部集める */
export function collectAllowedNumbers(value, out = new Set()) {
  if (typeof value === "number" && Number.isFinite(value)) out.add(value);
  else if (typeof value === "string") {
    for (const m of value.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      out.add(Number(m[0].replace(/,/g, "")));
    }
  } else if (Array.isArray(value)) value.forEach((v) => collectAllowedNumbers(v, out));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectAllowedNumbers(v, out));
  }
  return out;
}

/**
 * 本文の数字が材料のどれかと一致するか。「12.3万人」「約120万」「32%」のような丸めは、
 * 書かれた桁の精度の範囲で一致すれば可。31 以下の整数（日付・順位・人数）と年は常に可。
 * 整数の人数・同接は完全一致のみ（差や合計など、計算で作った数字を弾くため）。
 */
export function findUnsupportedNumbers(markdown, allowed, year) {
  const text = markdown.replace(/\]\([^)]*\)/g, "]"); // リンク先 URL の中の数字は見ない
  const bad = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(万|億)?(%|％)?/g)) {
    const raw = m[1].replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const unit = m[2] === "億" ? 1e8 : m[2] === "万" ? 1e4 : 1;
    const value = n * unit;
    if (unit === 1 && Number.isInteger(n) && (n <= 31 || n === year || n === year - 1 || n === year + 1)) {
      continue;
    }
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    const step = 10 ** -decimals * unit;
    const tolerance = unit === 1 && decimals === 0 && !m[3] ? 0 : step;
    const ok = [...allowed].some((a) => Math.abs(Math.abs(a) - value) <= tolerance + 1e-9);
    if (!ok) bad.push(m[0].trim());
  }
  return [...new Set(bad)];
}

export function numbersProblem(markdown, allowed, year) {
  const nums = findUnsupportedNumbers(markdown, allowed, year);
  return nums.length
    ? `材料にない数字があります: ${nums.join("、")}。数字は材料の値をそのまま（または万単位・小数1桁に丸めて）使い、差・合計・倍率など計算で新しい数字を作らないでください。`
    : null;
}

// ---------- リンクの検査 ----------

export function findBadLinks(markdown, allowedPaths) {
  const bad = [];
  for (const m of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (!allowedPaths.has(m[1])) bad.push(m[1]);
  }
  return [...new Set(bad)];
}

/** 本文のリンクに出てくる /vtuber/{channelId} を出現順に */
export function linkedChannelIds(markdown) {
  const ids = [];
  for (const m of markdown.matchAll(/\]\(\/vtuber\/([^)\s/?#]+)\)/g)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** 文字数（リンク記法と空白を除く） */
export function plainLength(markdown) {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*|>-]/g, "")
    .replace(/\s/g, "").length;
}

// ---------- Claude ----------

let client;

/**
 * 1 回の生成。stop_reason を確かめてから本文を返す。
 * 安全分類器が断ったときは、API 側で既定のモデルに切り替えて続ける（server-side fallback）。
 */
export async function callClaude({ system, messages, effort = "high" }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が未設定です");
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages,
  });
  if (response.stop_reason === "refusal") {
    throw new Error(`生成が拒否されました: ${JSON.stringify(response.stop_details)}`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("出力が上限で切れました");
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return text.replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/, "$1").trim();
}
