// 週刊特集（/guide/{slug}、カテゴリ「特集」）を Claude で書き、content/guide/{slug}.md に保存する。FRONTEND_SPEC.md 5.12.3
//
// 使い方:
//   ADMIN_USER=... ADMIN_PASSWORD=... ANTHROPIC_API_KEY=... \
//     node scripts/content/write-weekly-feature.mjs [--theme growth|events|live] [--base-url http://localhost:3000] [--force]
//
// 流れ: 材料（/api/admin/feature-data）→ 下書き → デスクの推敲 → 機械の検査（数字・リンク・言い回し・構成）
//       → 通らなければ 1 回だけ直させる → それでも駄目ならファイルを書かずに終了コード 1。
// テーマは指定がなければ週番号で growth → events → live の順に回す。同じ slug のファイルがあれば何もしない。
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  callClaude,
  collectAllowedNumbers,
  fetchAdminJson,
  findBadLinks,
  linkedChannelIds,
  numbersProblem,
  plainLength,
  todayJst,
} from "./lib.mjs";

const GUIDE_DIR = path.join("content", "guide");
const CATEGORY = "特集";
const THEMES = ["growth", "events", "live"];
const SLUG_PREFIX = { growth: "weekly-rising", events: "weekly-celebrations", live: "weekly-live" };

const LIMITS = {
  title: [15, 45],
  description: [50, 120],
  body: [1800, 4200],
  h2: [2, 5],
  bold: 4,
  bullets: 8,
};

/**
 * 機械的に弾く言い回し。どれも「生成された文章らしさ」が強く、情報を足さないもの。
 * 「」『』の中（動画タイトルの引用）は検査しない。
 */
const BANNED = [
  "いかがでしたか",
  "いかがでしょうか",
  "と言えるでしょう",
  "といえるでしょう",
  "言うまでもなく",
  "言わずと知れた",
  "目が離せません",
  "目が離せない",
  "注目が集まります",
  "必見",
  "深掘り",
  "紐解",
  "魅力に迫",
  "圧倒的",
  "まさに",
  "果たして",
  "皆さん",
  "みなさん",
  "ぜひチェック",
  "チェックしてみてください",
  "参考にしてください",
  "ご紹介しました",
  "見ていきましょう",
  "解説していきます",
  "結論から言うと",
  "重要なのは",
  "ポイントは",
];
const BANNED_HEADINGS = /^##\s*(はじめに|まとめ|おわりに|さいごに|最後に|結論|総括)/m;
/** 見ていない配信を見たように書く・体験を作る表現 */
const FAKE_EXPERIENCE = /(視聴しました|見てきました|観てきました|拝見しました|実際に見て|配信を見ていて|私は|僕は|筆者は|筆者も)/;

// ---------- 引数 ----------

function parseArgs(argv) {
  const args = { theme: null, baseUrl: "http://localhost:3000", force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--theme") args.theme = argv[++i];
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--force") args.force = true;
    else throw new Error(`不明な引数: ${a}`);
  }
  return args;
}

/** 週番号（1970-01-05 の月曜から数えた週）でテーマを回す */
function themeForWeek(dateIso) {
  const days = Math.floor((Date.parse(`${dateIso}T00:00:00Z`) - Date.parse("1970-01-05T00:00:00Z")) / 86400000);
  return THEMES[Math.floor(days / 7) % THEMES.length];
}

// ---------- 既存の記事 ----------

function readGuides() {
  return fs
    .readdirSync(GUIDE_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data, content } = matter(fs.readFileSync(path.join(GUIDE_DIR, f), "utf8"));
      return { slug: f.slice(0, -3), ...data, content };
    });
}

/** 文体の手本。サイトの既存記事から、データ解説と読み物を 1 本ずつ（冒頭だけ） */
function styleSamples(guides) {
  return ["growth-ranking-guide", "birthday-anniversary-guide"]
    .map((slug) => guides.find((g) => g.slug === slug))
    .filter(Boolean)
    .map((g) => `### 手本: ${g.title}\n${g.content.trim().slice(0, 1800)}`)
    .join("\n\n");
}

// ---------- プロンプト ----------

const THEME_BRIEF = {
  growth: `今週の特集テーマは「今週、登録者が伸びたチャンネル」。
- 材料の channels は、週間の増加数の上位（inTopByGrowth）と、登録者1万人以上での増加率の上位（inTopByRate）を合わせたもの。
- 全員を順に紹介する記事にしない。読み手が「へえ」と思う切り口を 1 つ決め、それに沿って 3〜5 チャンネルを選んで書く（例: 規模の違う 2 人の伸び方の対比、dailySubscribers から読める伸びた日の偏り、同じ事務所・グループの並び）。
- videosInPeriod は期間中の動画（タイトル・日付・再生数）。伸びと同じ時期にどんな動画を出していたかは書いてよいが、「この動画のおかげで伸びた」と因果を断定しない（「同じ週には『…』という動画も出ています」程度）。
- 最後に [登録者 急上昇ランキング](/ranking) へつなぐ。`,
  events: `今週の特集テーマは「今週のお祝い（誕生日・デビュー記念日）」。
- 材料の days は明日から 7 日間。日ごとの件数と、登録者の多い順に数人（notable）。
- 7 日分を同じ形で並べるカレンダーにしない。周年の節目（5周年・10周年など）や、同じ日に同じグループの人が重なるところなど、話のある日を中心に構成する。
- 記念配信の予定や企画内容は材料にないので書かない。「記念配信があるかは、各チャンネルの配信予定を確かめてください」のように読者に委ねる。
- 日付には、その日のイベントページ（eventsPage）へのリンクを付けてよい。`,
  live: `今週の特集テーマは「今週、同時接続が多かった配信」。
- 材料の videos は直近 1 週間の最大同時接続数の上位 15 本（アーカイブの再生数ではない）。officeCountInTop15 は上位 15 本の事務所の内訳。
- 順位を上から読み上げない。配信の種類（ゲームの発売日、3D お披露目、大型イベントの同時視聴など、タイトルから分かる範囲）でまとまりを作り、今週の空気が伝わるように書く。
- 配信の中身・盛り上がりは見ていないので書かない。分かるのはタイトル・日付・同接だけ。`,
};

const SYSTEM = `あなたは VTuber データサイト「Vちゃんねる」の編集部で、毎週の特集記事を書いています。記事は運営する編集部の名義で載ります。

# 何を書くか
サイトが毎日集計しているデータ（材料の JSON）から、今週ならではの話を 1 本の読み物にします。ランキングの表はサイトに別にあるので、表の言い換えではなく「データを見た編集部が何に気づいたか」を書きます。VTuber が好きな人が、通勤中にスマホで最後まで読める記事を目指してください。

# 事実（最重要。破ると記事は没）
- 名前・事務所・数字・動画タイトル・日付は、材料にあるものだけを使う。数字は材料の値そのまま、または「約12.3万人」のような丸めまで。差・合計・倍率・平均など、計算で新しい数字を作らない。
- 材料にない出来事・理由・配信の内容・人柄・ファンの反応を書かない。推測で補わない。
- 編集部は配信を見ていない前提で書く。「見ました」「〜な配信でした」のような視聴体験や、一人称の感想・体験談を作らない。
- 気づきや所感は、データに根拠があるものなら書いてよい（「規模がまったく違う 2 人が、同じ週に同じくらい伸びているのは面白い並びです」など）。

# 文章
- です・ます調。文の長さに緩急をつけ、同じ文末を 3 回以上続けない。
- 書き出しは、今週いちばん目を引く具体的な事実から。季節の挨拶、問いかけ（「〜をご存じですか？」）、記事の説明（「この記事では〜」）から始めない。
- 見出しは ## を 2〜5 個。内容が分かる具体的な見出しにする（「はじめに」「まとめ」「おわりに」は使わない）。# と ### は使わない。
- 最後は要約で締めない。読者が次に開くページ（個別ページ、イベントページ、ランキング）へ自然につなぐ。
- 箇条書きは 1 か所まで、表は 1 つまで。太字は 4 か所まで。絵文字・顔文字・「！」の連発は使わない。
- 抽象的なほめ言葉（魅力的、素晴らしい、圧倒的）で行を埋めず、名前・数字・タイトルで具体的に書く。
- 次の言い回しは使わない: ${BANNED.join("、")}。

# リンク
- 人物名の初出には [名前](/vtuber/{channelId})（材料にある channelId のみ）。名前はチャンネル名から「Ch.」「Channel」や【】などを外した呼び名にしてよい。
- ほかに使ってよいのは /ranking、材料にある eventsPage、/guide/{既存記事の slug}（下に一覧）。外部リンクは付けない。

# 出力
次の形だけを出力する（前置き・説明・コードブロックなし）。
---
title: "記事タイトル（15〜45 字。数字や名前を入れて具体的に。煽らない）"
description: "検索結果に出る説明（50〜120 字）"
---
本文（1800〜4000 字）`;

const DESK = `あなたは「Vちゃんねる」編集部のデスクです。新人が書いた特集記事を、公開できる原稿に仕上げます。
材料（JSON）と照らし合わせながら、全文を書き直して出力してください。出力の形は下書きと同じ（--- で囲んだ title / description と本文）。前置きやコメントは書かない。

直すこと:
1. 事実: 材料にない数字・出来事・理由・配信内容・感想が混じっていたら消す。計算で作った数字（差・合計・倍率）も消す。
2. 生成された文章に見える癖を消す:
   - 前置き・記事の説明・最後の要約の繰り返し
   - 何でも 3 つ並べる列挙、毎段落同じ形（主張→例→まとめ）の繰り返し
   - 「また」「さらに」「一方で」の段落頭の連発、同じ文末の連続
   - 情報のない文（「どのチャンネルも個性的です」「今後の活躍が楽しみです」など）。削って短くなるなら短くてよい
   - 太字の多用、見出しの言い換えだけの段落
3. 読み物として: 書き出しの 2 文で読み続けたくなるか。切り口が 1 本通っているか。数字が続きすぎて読みにくい所は、文章で比べ方を示す。
4. 体裁: 見出し ## は 2〜5 個、箇条書きは 1 か所まで、リンクは許可されたものだけ、文字数 1800〜4000 字。`;

function materialsMessage(materials, extras) {
  return `${extras}\n\n材料(JSON):\n${JSON.stringify(materials, null, 2)}`;
}

// ---------- 検査 ----------

function stripQuotes(text) {
  return text.replace(/「[^」]*」|『[^』]*』/g, "「」");
}

function validate(article, ctx) {
  const problems = [];
  let parsed;
  try {
    parsed = matter(article);
  } catch {
    return ["先頭の --- で囲んだ title / description が読み取れません。"];
  }
  const { data, content } = parsed;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const body = content.trim();

  const within = (n, [min, max]) => n >= min && n <= max;
  if (!within([...title].length, LIMITS.title)) problems.push(`title が ${[...title].length} 字です（${LIMITS.title.join("〜")} 字）。`);
  if (!within([...description].length, LIMITS.description)) {
    problems.push(`description が ${[...description].length} 字です（${LIMITS.description.join("〜")} 字）。`);
  }
  const len = plainLength(body);
  if (!within(len, LIMITS.body)) problems.push(`本文が ${len} 字です（${LIMITS.body.join("〜")} 字）。`);

  const h2 = (body.match(/^##\s/gm) ?? []).length;
  if (!within(h2, LIMITS.h2)) problems.push(`## 見出しが ${h2} 個です（${LIMITS.h2.join("〜")} 個）。`);
  if (/^#\s|^###/m.test(body)) problems.push("# と ### の見出しは使わないでください。");
  if (BANNED_HEADINGS.test(body)) problems.push("「はじめに」「まとめ」などの見出しは使わないでください。");
  const bold = (body.match(/\*\*[^*]+\*\*/g) ?? []).length;
  if (bold > LIMITS.bold) problems.push(`太字が ${bold} か所あります（${LIMITS.bold} か所まで）。`);
  const bulletBlocks = (body.match(/(^|\n\n)(\s*[-*]|\s*\d+\.)\s/g) ?? []).length;
  if (bulletBlocks > 1) problems.push("箇条書きは 1 か所までにしてください。");

  const prose = stripQuotes(`${title}\n${description}\n${body}`);
  const banned = BANNED.filter((w) => prose.includes(w));
  if (banned.length) problems.push(`使わない言い回しがあります: ${banned.join("、")}`);
  if (FAKE_EXPERIENCE.test(prose)) problems.push("視聴体験や一人称の感想は書かないでください（編集部は配信を見ていない前提）。");
  if (/\p{Extended_Pictographic}/u.test(prose)) problems.push("絵文字は使わないでください。");
  if (/[！!]{2,}/.test(prose) || (prose.match(/[！!]/g) ?? []).length > 3) {
    problems.push("「！」は重ねず、記事全体で 3 つまでにしてください。");
  }
  if (/^(この記事では|本記事では|今回は)/.test(body.replace(/^\s+/, ""))) {
    problems.push("記事の説明から書き出さないでください。");
  }

  const nums = numbersProblem(`${title}\n${description}\n${body}`, ctx.allowedNumbers, ctx.year);
  if (nums) problems.push(nums);
  const links = findBadLinks(body, ctx.allowedPaths);
  if (links.length) problems.push(`使えないリンクがあります: ${links.join("、")}`);
  if (linkedChannelIds(body).length === 0) problems.push("人物名に /vtuber/{channelId} のリンクを付けてください。");

  return problems;
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = todayJst();
  const theme = args.theme ?? themeForWeek(today);
  if (!THEMES.includes(theme)) throw new Error(`--theme は ${THEMES.join(" / ")}: ${theme}`);

  const slug = `${SLUG_PREFIX[theme]}-${today}`;
  const outFile = path.join(GUIDE_DIR, `${slug}.md`);
  if (fs.existsSync(outFile) && !args.force) {
    console.log(`${outFile} は既にあるのでスキップします（上書きするなら --force）。`);
    return;
  }

  const materials = await fetchAdminJson(args.baseUrl, `/api/admin/feature-data?theme=${theme}`);
  if (!materials) throw new Error("材料が取れませんでした");
  const empty =
    (theme === "growth" && !materials.channels?.length) ||
    (theme === "events" && !materials.days?.some((d) => d.notable.length)) ||
    (theme === "live" && !materials.videos?.length);
  if (empty) {
    console.log(`${theme} の材料が空なのでスキップします。`);
    return;
  }

  const guides = readGuides();
  const existingSlugs = guides.map((g) => g.slug).filter((s) => s !== slug);
  const pastFeatures = guides
    .filter((g) => g.category === CATEGORY)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, 8)
    .map((g) => `- ${g.publishedAt} ${g.title}`);

  const allowedPaths = new Set(["/ranking", ...existingSlugs.map((s) => `/guide/${s}`)]);
  const ids = [
    ...(materials.channels ?? []),
    ...(materials.videos ?? []),
    ...(materials.days ?? []).flatMap((d) => d.notable),
  ].map((x) => x.channelId);
  ids.filter(Boolean).forEach((id) => allowedPaths.add(`/vtuber/${id}`));
  (materials.days ?? []).forEach((d) => allowedPaths.add(d.eventsPage));
  const ctx = {
    allowedNumbers: collectAllowedNumbers(materials),
    allowedPaths,
    year: Number(today.slice(0, 4)),
  };

  const extras = [
    `今日は ${today}（JST）です。`,
    THEME_BRIEF[theme],
    `## リンクしてよい既存記事の slug\n${existingSlugs.join(", ")}`,
    pastFeatures.length
      ? `## 最近の特集（切り口やタイトルが似ないようにする）\n${pastFeatures.join("\n")}`
      : "",
    `## サイトの文体の手本（話題は真似せず、語り口と温度感だけ参考にする）\n${styleSamples(guides)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const userMessage = materialsMessage(materials, extras);

  console.log(`テーマ: ${theme} / slug: ${slug}`);
  const draft = await callClaude({ system: SYSTEM, messages: [{ role: "user", content: userMessage }] });
  console.log(`--- 下書き ---\n${draft}\n`);

  const deskMessages = [
    {
      role: "user",
      content: `${userMessage}\n\n## 新人の下書き\n${draft}`,
    },
  ];
  let article = await callClaude({ system: `${DESK}\n\n# 下書きの書き手が受けた指示\n${SYSTEM}`, messages: deskMessages });
  let problems = validate(article, ctx);

  if (problems.length) {
    console.log(`検査で問題:\n- ${problems.join("\n- ")}\n直させます。`);
    deskMessages.push({ role: "assistant", content: article });
    deskMessages.push({
      role: "user",
      content: `機械の検査で次の問題が見つかりました。直して全文を出力してください。\n- ${problems.join("\n- ")}`,
    });
    article = await callClaude({ system: `${DESK}\n\n# 下書きの書き手が受けた指示\n${SYSTEM}`, messages: deskMessages });
    problems = validate(article, ctx);
  }
  if (problems.length) {
    console.error(`検査に通らなかったので保存しません:\n- ${problems.join("\n- ")}\n\n--- 原稿 ---\n${article}`);
    process.exit(1);
  }

  const { data, content } = matter(article);
  const related = linkedChannelIds(content).slice(0, 8);
  const front = {
    title: data.title.trim(),
    description: data.description.trim(),
    publishedAt: today,
    category: CATEGORY,
    ...(related.length ? { relatedVtubers: related } : {}),
  };
  fs.writeFileSync(outFile, matter.stringify(`\n${content.trim()}\n`, front), "utf8");
  console.log(`✅ ${outFile} を書きました。\n\n${fs.readFileSync(outFile, "utf8")}`);
}

export { validate, themeForWeek };

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
