// auto-coder / auto-fixer の AI 出力を読み取り、安全にファイルへ反映するためのヘルパー。
//
// 出力形式（JSON にしないのは、ファイル全体をエスケープさせると壊れやすいため）:
//
//   <<<SUMMARY>>>
//   変更内容の要約（PR 本文に載せる）
//   <<<FILE app/example/page.tsx>>>
//   ファイル全体の内容
//   <<<SPEC ### 5.6 チャット（掲示板）>>>
//   FRONTEND_SPEC.md のこの見出しの節の末尾に追記する文章
//   <<<END>>>
//
// 書き込めるのは ALLOWED_DIRS 配下の ALLOWED_EXT のファイルだけ。
// 管理画面・記事の自動作成（AGENTS.md で Claude Code 担当）や .md、scripts/、.github/ は書き込まない。
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

export const MAX_FILES = 6;
const ALLOWED_DIRS = ['app/', 'components/', 'lib/', 'hooks/', 'types/'];
const ALLOWED_EXT = /\.(tsx?|css)$/;
const FORBIDDEN_PREFIXES = ['app/admin/', 'app/api/admin/', 'components/admin/', 'lib/admin/'];
const SPEC_FILE = 'FRONTEND_SPEC.md';

export const OUTPUT_FORMAT_INSTRUCTIONS = `## 出力形式（厳守）
次の区切り行を使い、プレーンテキストで出力してください。JSON・コードブロック（\`\`\`）・解説文は使わないでください。

<<<SUMMARY>>>
変更内容の要約（日本語 1〜4 行）
<<<FILE 変更・新規作成するファイルのパス>>>
そのファイルの中身全体（差分ではなく全文）
<<<FILE 2 つ目のファイルのパス>>>
…（必要なファイルの数だけ。最大 ${MAX_FILES} ファイル）
<<<SPEC FRONTEND_SPEC.md に既にある見出し行をそのまま（例: ### 5.6 チャット（掲示板））>>>
その節の末尾に追記する箇条書き（仕様・UI ルールが変わった場合のみ。不要なら SPEC ブロックごと省略）
<<<END>>>

- 書き込めるのは ${ALLOWED_DIRS.join('、')} 配下の .ts / .tsx / .css だけです（${FORBIDDEN_PREFIXES.join('、')} は不可）。
- SPEC の見出しは FRONTEND_SPEC.md に実在する行と一字一句同じにしてください。`;

/** AI の出力を { summary, files: [{ filePath, content }], specs: [{ heading, text }] } に分解する */
export function parseAiOutput(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const result = { summary: '', files: [], specs: [] };
  let current = null;
  const flush = () => {
    if (!current) return;
    // 区切り行の直後・直前の空行は落とす（ファイル末尾の改行は 1 つにそろえる）
    const body = current.lines.join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
    if (current.kind === 'SUMMARY') result.summary = body;
    if (current.kind === 'FILE') result.files.push({ filePath: current.arg, content: `${body}\n` });
    if (current.kind === 'SPEC' && body) result.specs.push({ heading: current.arg, text: body });
    current = null;
  };
  for (const line of lines) {
    const m = line.match(/^<<<(SUMMARY|FILE|SPEC|END)(?:\s+(.+?))?>>>\s*$/);
    if (m) {
      flush();
      if (m[1] === 'END') break;
      current = { kind: m[1], arg: (m[2] || '').trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return result;
}

/** 書き込んでよいパスか。だめなら理由を返す */
export function rejectReason(filePath) {
  const p = path.posix.normalize(filePath.replace(/\\/g, '/')).replace(/^\.\//, '');
  if (p.startsWith('/') || p.split('/').includes('..')) return '絶対パス・親ディレクトリは不可';
  if (!ALLOWED_DIRS.some((d) => p.startsWith(d))) return `${ALLOWED_DIRS.join(', ')} 以外は不可`;
  if (FORBIDDEN_PREFIXES.some((d) => p.startsWith(d))) return '管理画面（Claude Code 担当）は不可';
  if (!ALLOWED_EXT.test(p)) return '.ts / .tsx / .css 以外は不可';
  return null;
}

/** 出力されたファイルを検査して書き込む。1 つでも不正なら何も書かずにエラーにする */
export function writeFiles(files) {
  if (files.length === 0) throw new Error('ファイルが 1 つも出力されていません');
  if (files.length > MAX_FILES) throw new Error(`ファイル数が上限 ${MAX_FILES} を超えています (${files.length})`);
  const problems = files
    .map((f) => [f.filePath, f.content.trim() ? rejectReason(f.filePath) : '中身が空'])
    .filter(([, r]) => r);
  if (problems.length) {
    throw new Error(`書き込めないファイルがあります:\n${problems.map(([p, r]) => `  ${p}: ${r}`).join('\n')}`);
  }
  for (const f of files) {
    fs.mkdirSync(path.dirname(f.filePath), { recursive: true });
    fs.writeFileSync(f.filePath, f.content, 'utf8');
    console.log(`Wrote: ${f.filePath}`);
  }
}

/**
 * FRONTEND_SPEC.md の指定見出しの節の末尾に text を差し込む。既存の行は一切変えない。
 * 見出しが見つからない追記はスキップする（実装自体は止めない）。
 */
export function appendSpecs(specs) {
  if (!specs.length || !fs.existsSync(SPEC_FILE)) return [];
  const before = fs.readFileSync(SPEC_FILE, 'utf8');
  const lines = before.split('\n');
  const applied = [];
  for (const { heading, text } of specs) {
    const start = lines.findIndex((l) => l.trim() === heading.trim());
    const level = heading.trim().match(/^(#{1,6}) /)?.[1].length;
    if (start === -1 || !level) {
      console.log(`⚠ FRONTEND_SPEC.md に見出し「${heading}」が無いため、仕様の追記をスキップしました。`);
      continue;
    }
    // 同じか上位レベルの次の見出しの手前が節の終わり
    let end = start + 1;
    while (end < lines.length) {
      const h = lines[end].match(/^(#{1,6}) /);
      if (h && h[1].length <= level) break;
      end++;
    }
    while (end > start + 1 && lines[end - 1].trim() === '') end--;
    lines.splice(end, 0, ...text.split('\n'));
    applied.push(heading);
  }
  const after = lines.join('\n');
  // 念のため: 追記のみで、既存の行が 1 行も消えていないことを確かめる
  const remaining = new Map();
  for (const l of after.split('\n')) remaining.set(l, (remaining.get(l) || 0) + 1);
  for (const l of before.split('\n')) {
    const n = remaining.get(l) || 0;
    if (n === 0) throw new Error('FRONTEND_SPEC.md の既存の行が消えるため、仕様の追記を中止しました。');
    remaining.set(l, n - 1);
  }
  if (applied.length) {
    fs.writeFileSync(SPEC_FILE, after, 'utf8');
    console.log(`FRONTEND_SPEC.md に追記しました: ${applied.join(' / ')}`);
  }
  return applied;
}

/**
 * Messages API をストリーミングで呼び、テキスト部分を返す。
 * Sonnet 5.5 は思考（adaptive thinking）が既定でオンで、思考のトークンも max_tokens に含まれる。
 * 大きいファイルの全文を出すと 32K では足りないため、上限 128K にしてストリーミングで受ける
 * （非ストリーミングで大きい max_tokens を使うと HTTP タイムアウトになるため）。
 */
export async function callClaude(prompt, { maxTokens = 128000 } = {}) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: 'claude-sonnet-5-5',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  const data = await stream.finalMessage();
  if (data.usage) console.log(`usage: input ${data.usage.input_tokens} / output ${data.usage.output_tokens} tokens (stop: ${data.stop_reason})`);
  if (data.stop_reason === 'max_tokens') {
    throw new Error('出力が max_tokens で途中で切れたため、反映しません。');
  }
  if (data.stop_reason === 'refusal') {
    throw new Error(`モデルが応答を拒否しました: ${JSON.stringify(data.stop_details)}`);
  }
  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw new Error(`レスポンスにテキストがありません: ${JSON.stringify(data)}`);
  return text;
}
