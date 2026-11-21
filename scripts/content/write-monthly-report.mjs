// 月報（/reports/YYYY-MM）の「編集部コメント」を Claude で書き、content/reports/YYYY-MM.md に保存する。
//
// 使い方:
//   ADMIN_USER=... ADMIN_PASSWORD=... ANTHROPIC_API_KEY=... \
//     node scripts/content/write-monthly-report.mjs [--month 2026-11] [--base-url http://localhost:3000] [--force]
//
// - 材料は /api/admin/report-data（ページと同じ getMonthlyReport()）から取るので、数字はページの表と一致する。
// - 本文中の数字がすべて材料にあるか、リンク先が許可したものだけかを検査する。通らなければ 1 回だけ書き直させ、
//   それでもだめならファイルを書かずに終了コード 1 で止まる。
// - 既にファイルがある月は何もしない。ただし自動で書いた文（先頭に集計日の目印）が月の途中のデータなら書き直す。
//   人が直したときは目印の行を消せば、以後は上書きされない。--force で常に書き直す。
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const MIN_CHARS = 300;
const MAX_CHARS = 1200;
/** 自動生成の目印（HTML コメントなのでページには出ない） */
const MARKER_RE = /^<!-- auto-generated: dataThrough=(\d{4}-\d{2}-\d{2}) -->$/m;

// ---------- 引数 ----------

function parseArgs(argv) {
  const args = { month: null, baseUrl: "http://localhost:3000", force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--month") args.month = argv[++i];
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--force") args.force = true;
    else throw new Error(`不明な引数: ${a}`);
  }
  return args;
}

/** JST の「先月」。毎月 1 日に動かすと、締まったばかりの月を書く */
function previousMonthJst() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------- 材料 ----------

async function fetchReportData(baseUrl, month) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) throw new Error("ADMIN_USER / ADMIN_PASSWORD が未設定です");
  const auth = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  const res = await fetch(
    `${baseUrl}/api/admin/report-data?month=${encodeURIComponent(month)}`,
    { headers: { authorization: `Basic ${auth}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`report-data の取得に失敗: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

/** モデルに渡す形へ。画像 URL やミニグラフ用の配列など、文章に使わないものは落とす */
function slimReport(r) {
  if (!r) return null;
  return {
    month: r.month,
    dataThrough: r.dataThrough,
    growthTop10: r.growth.map((g, i) => ({
      rank: i + 1,
      channelId: g.channelId,
      name: g.name,
      office: g.office || "個人勢",
      subscribersAtEnd: g.current,
      growth: g.growth,
      ratePercent: Math.round(g.rate * 10) / 10,
    })),
    officeGrowthTop5: r.officeGrowth,
    liveVideosTop10: r.liveVideos.map((v, i) => ({
      rank: i + 1,
      channelId: v.channelId,
      channelTitle: v.channelTitle,
      office: v.office || "個人勢",
      title: v.title,
      concurrentViewers: v.concurrentViewers,
    })),
    birthdays: r.birthdays,
    debutAnniversaries: r.debutAnniversaries,
    eventPeople: r.eventPeople.map((p) => ({
      channelId: p.channelId,
      name: p.name,
      office: p.office || "個人勢",
      subscriberCount: p.subscriberCount,
      milestones: p.milestones,
    })),
  };
}

// ---------- 検査 ----------

/** 材料に出てくる数字（数値フィールドと、文字列中の数字）を全部集める */
function collectAllowedNumbers(value, out = new Set()) {
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
 * 本文の数字が材料のどれかと一致するか。「12.3万人」「約120万」のような丸めは、
 * 書かれた桁の精度の範囲で一致すれば可。31 以下の整数（日付・順位・人数）と年は常に可。
 */
function findUnsupportedNumbers(markdown, allowed, year) {
  const text = markdown.replace(/\]\([^)]*\)/g, "]"); // リンク先 URL の中の数字は見ない
  const bad = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(万|億)?(%|％)?/g)) {
    const raw = m[1].replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const unit = m[2] === "億" ? 1e8 : m[2] === "万" ? 1e4 : 1;
    const value = n * unit;
    if (unit === 1 && Number.isInteger(n) && (n <= 31 || n === year || n === year - 1)) continue;
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    const step = 10 ** -decimals * unit;
    // 整数の人数・同接は完全一致。% と万・億は書いた桁で丸めた範囲なら可
    const tolerance = unit === 1 && decimals === 0 && !m[3] ? 0 : step;
    const ok = [...allowed].some((a) => Math.abs(Math.abs(a) - value) <= tolerance + 1e-9);
    if (!ok) bad.push(m[0].trim());
  }
  return [...new Set(bad)];
}

function findBadLinks(markdown, allowedPaths) {
  const bad = [];
  for (const m of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (!allowedPaths.has(m[1])) bad.push(m[1]);
  }
  return bad;
}

function validate(markdown, ctx) {
  const problems = [];
  const plain = markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const len = plain.replace(/\s/g, "").length;
  if (len < MIN_CHARS || len > MAX_CHARS) {
    problems.push(`本文が ${len} 文字です。${MIN_CHARS}〜${MAX_CHARS} 文字にしてください。`);
  }
  if (/^#{1,6}\s/m.test(markdown)) problems.push("見出し（#）は使わないでください。");
  const nums = findUnsupportedNumbers(markdown, ctx.allowedNumbers, ctx.year);
  if (nums.length) {
    problems.push(
      `材料にない数字があります: ${nums.join("、")}。数字は材料の値をそのまま（または万単位に丸めて）使い、計算で新しい数字を作らないでください。`,
    );
  }
  const links = findBadLinks(markdown, ctx.allowedPaths);
  if (links.length) problems.push(`使えないリンクがあります: ${links.join("、")}`);
  return problems;
}

// ---------- 生成 ----------

const SYSTEM = `あなたは VTuber データサイト「Vちゃんねる」の編集部員です。月間レポートページの冒頭に載せる「編集部コメント」を書きます。
ページには登録者の伸び TOP10・事務所別の伸び・人気配信・誕生日と周年の表がすでに並んでいます。コメントの役目は、表を読む前に「今月はどんな月だったか」をつかんでもらい、表や個別ページへ読み進めてもらうことです。

書き方:
- 日本語、です・ます調。400〜800 文字。3〜5 段落。見出し（#）は使わない。箇条書きは使うなら 1 か所だけ。
- 表の数字を順に読み上げるのではなく、目立つ傾向や対比を 2〜3 個選んで書く（例: 増加数の上位と増加率の上位の顔ぶれの違い、事務所別の差、周年の顔ぶれ）。
- VTuber ファンが読んで楽しい、落ち着いた文体。煽り・誇張（「爆伸び」「神回」など）は使わない。

事実について（最重要）:
- 数字は材料にある値だけを使う。「約12.3万人」のような万単位への丸めは可。差・合計・前月比など、計算で新しい数字を作らない。
- 伸びた理由・配信の内容・出来事は、材料に書かれていない限り推測で書かない（「〇〇の影響で」「話題の企画で」など）。理由に触れたいときは「何があったのか、チャンネルをのぞいてみてください」のように読者に委ねる。
- 人気配信の材料は、直近 1 週間の同時接続ランキングのうちこの月に配信されたものだけ。「月間で最も見られた配信」とは書かず、「集計期間の中で同接が多かった配信」として扱う。
- dataThrough が月末より前なら、その日までの集計であることを一言添える。
- 前月の材料（previous）は比較に使ってよいが、前月の数字を本文に出すときも材料の値そのままにする。

リンク:
- 人物名に付けてよいリンクは /vtuber/{channelId}（材料にある channelId のみ）。ほかに使ってよいのは /ranking と /reports/{今月} だけ。外部リンクは付けない。
- リンクはマークダウン形式 [名前](/vtuber/UCxxxx)。全部で 3〜6 個程度。

出力は本文のマークダウンだけ。前置きや説明、コードブロックで囲むことはしない。`;

async function generate(client, materials, feedback) {
  const messages = [
    {
      role: "user",
      content: `${materials.label} の月間レポートの編集部コメントを書いてください。\n\n材料(JSON):\n${JSON.stringify(materials.data, null, 2)}`,
    },
  ];
  if (feedback) {
    messages.push({ role: "assistant", content: feedback.previous });
    messages.push({
      role: "user",
      content: `次の問題を直して、全文を書き直してください。\n- ${feedback.problems.join("\n- ")}`,
    });
  }

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    // 安全分類器が断ったときは、API 側で既定のモデルに切り替えて続ける
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
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

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const month = args.month ?? previousMonthJst();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`--month は YYYY-MM: ${month}`);

  const outFile = path.join("content", "reports", `${month}.md`);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が未設定です");

  const fetched = await fetchReportData(args.baseUrl, month);
  if (!fetched) {
    console.log(`${month} のレポートデータがないのでスキップします。`);
    return;
  }
  if (fs.existsSync(outFile) && !args.force) {
    // 自動で書いた文には集計日の目印が入っている。月の途中で書いたものなら、新しいデータで書き直す。
    // 目印の行を消した（＝人が手を入れた）ファイルは上書きしない。
    const existing = fs.readFileSync(outFile, "utf8");
    const written = MARKER_RE.exec(existing)?.[1];
    const latest = fetched.report.dataThrough;
    if (!written || !latest || latest <= written) {
      console.log(`${outFile} は既にあるのでスキップします（上書きするなら --force）。`);
      return;
    }
    console.log(`${outFile} は ${written} 時点のデータなので、${latest} までのデータで書き直します。`);
  }
  const current = slimReport(fetched.report);
  const previous = slimReport(fetched.previous);
  if (current.growthTop10.length === 0) {
    console.log(`${month} は登録者の伸びデータが空なのでスキップします。`);
    return;
  }

  const [y, m] = month.split("-").map(Number);
  const data = { current, previous };
  const allowedPaths = new Set(["/ranking", `/reports/${month}`]);
  for (const r of [current, previous]) {
    if (!r) continue;
    for (const item of [...r.growthTop10, ...r.liveVideosTop10, ...r.eventPeople]) {
      if (item.channelId) allowedPaths.add(`/vtuber/${item.channelId}`);
    }
  }
  const ctx = { allowedNumbers: collectAllowedNumbers(data), allowedPaths, year: y };
  const materials = { label: `${y}年${m}月`, data };

  const client = new Anthropic();
  let markdown = await generate(client, materials);
  let problems = validate(markdown, ctx);
  if (problems.length) {
    console.log(`1 回目の検査で問題:\n- ${problems.join("\n- ")}\n書き直させます。`);
    markdown = await generate(client, materials, { previous: markdown, problems });
    problems = validate(markdown, ctx);
  }
  if (problems.length) {
    console.error(`検査に通らなかったので保存しません:\n- ${problems.join("\n- ")}\n\n--- 生成文 ---\n${markdown}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const marker = `<!-- auto-generated: dataThrough=${fetched.report.dataThrough} -->`;
  fs.writeFileSync(outFile, `${marker}\n${markdown}\n`, "utf8");
  console.log(`✅ ${outFile} を書きました。\n\n${markdown}`);
}

export { collectAllowedNumbers, slimReport, validate };

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
