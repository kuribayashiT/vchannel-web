// COPILOT_TASK.md を自動パイプラインから安全に更新するためのヘルパー。
//
// 方針: AI にファイル全体を書き直させない。AI には「追記する部分」だけを出力させ、
// 差し込みはこのスクリプトが行う。書き込み前に、既存タスクの行やコードブロックが
// 消えていないかを検査し、消えていたら書き込まずにエラーにする。
// （2026-11-12 PR #17・2026-11-13 PR #18 で、全体書き直しによりファイル後半と ``` が消えたため）
import fs from 'fs';

export const TASK_FILE = 'COPILOT_TASK.md';

/** AI が提案したタスクを入れるセクション。ファイル末尾に置くので、PM のタスクより後に着手される */
export const AI_SECTION_HEADING =
  '### 🤖 AI 提案タスク（自動追加・PM 未レビュー。上の PM のタスクがすべて終わってから着手）';

const TASK_LINE = /^- \[[ xX]\] /;
/** タスク行にこの印があると、自動パイプラインは実装せず飛ばす（GitHub Copilot が手動で実装する） */
export const COPILOT_ONLY_MARK = '【Copilot】';
const OPEN_TASK_LINE = /^- \[ \] /;
/** タスクのブロックの終わり（次のタスク・見出し・区切り線） */
const BLOCK_END = /^(- \[[ xX]\] |#{1,6} |---\s*$)/;

export function readTaskFile() {
  return fs.readFileSync(TASK_FILE, 'utf8');
}

function taskLines(content) {
  return content.split('\n').filter((l) => TASK_LINE.test(l));
}

function fenceCount(content) {
  return (content.match(/```/g) || []).length;
}

/**
 * ファイル内で最初の未完了タスク（行頭が `- [ ] `、【Copilot】付きを除く）を返す。
 * auto-coder・完了マーク・失敗メモはすべてこの関数で対象を決め、ずれないようにする。
 */
export function firstOpenTask(content) {
  const lines = content.split('\n');
  // 【Copilot】付きのタスク（backend-repo の変更など、パイプラインでは実装できないもの）は飛ばす
  const start = lines.findIndex((l) => OPEN_TASK_LINE.test(l) && !l.includes(COPILOT_ONLY_MARK));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !BLOCK_END.test(lines[end])) end++;
  // ブロック末尾の空行はブロックに含めない
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  return {
    line: lines[start],
    startIndex: start,
    endIndex: end, // 排他的
    block: lines.slice(start, end).join('\n'),
  };
}

/** AI 提案セクションより上（= PM のタスク）に未完了タスクが残っているか */
export function hasOpenPmTask(content) {
  for (const line of content.split('\n')) {
    if (line === AI_SECTION_HEADING) return false;
    if (OPEN_TASK_LINE.test(line)) return true;
  }
  return false;
}

/** タスク行（タイトル）だけを返す。重複チェック用に AI へ渡す */
export function taskTitleLines(content) {
  return taskLines(content).join('\n');
}

/**
 * 既存のタスク行がすべて残っているか、コードブロック記号が減っていないかを検査する。
 * `checkedLine` を渡した場合、その 1 行だけは `- [x]` への変更を許す。
 */
export function verifyIntegrity(before, after, { checkedLine = null } = {}) {
  const afterSet = new Set(taskLines(after));
  const missing = taskLines(before).filter((line) => {
    if (afterSet.has(line)) return false;
    if (line === checkedLine && afterSet.has(line.replace(/^- \[ \] /, '- [x] '))) return false;
    return true;
  });
  const problems = [];
  if (missing.length) problems.push(`消えたタスク行 ${missing.length} 件:\n  ${missing.join('\n  ')}`);
  if (fenceCount(after) < fenceCount(before)) {
    problems.push(`コードブロック記号 \`\`\` が減った (${fenceCount(before)} → ${fenceCount(after)})`);
  }
  if (after.length < before.length) {
    problems.push(`ファイルが短くなった (${before.length} → ${after.length} 文字)`);
  }
  if (problems.length) {
    throw new Error(`${TASK_FILE} の検査に失敗したため書き込みません。\n${problems.join('\n')}`);
  }
}

export function writeTaskFileSafely(before, after, options) {
  verifyIntegrity(before, after, options);
  fs.writeFileSync(TASK_FILE, after, 'utf8');
}

/** AI 出力全体が 1 つのコードブロックで囲まれている場合だけ、外側の囲みを外す（中の ``` は消さない） */
export function unwrapOuterFence(text) {
  const t = text.trim();
  const m = t.match(/^```[\w-]*\n([\s\S]*)\n```$/);
  return m ? m[1].trim() : t;
}

/** AI 提案タスクのセクション末尾に block を追記した内容を返す（セクションが無ければ末尾に作る） */
export function appendToAiSection(content, block) {
  const lines = content.replace(/\s+$/, '').split('\n');
  const head = lines.indexOf(AI_SECTION_HEADING);
  if (head === -1) {
    return `${lines.join('\n')}\n\n---\n\n${AI_SECTION_HEADING}\n\n${block}\n`;
  }
  let end = head + 1;
  while (end < lines.length && !/^#{1,3} /.test(lines[end])) end++;
  while (end > head + 1 && lines[end - 1].trim() === '') end--;
  lines.splice(end, 0, '', block);
  return `${lines.join('\n')}\n`;
}

/** 最初の未完了タスクのブロック末尾に note を差し込んだ内容を返す */
export function insertNoteAfterFirstOpenTask(content, note) {
  const task = firstOpenTask(content);
  if (!task) return null;
  const lines = content.split('\n');
  lines.splice(task.endIndex, 0, ...note.split('\n'));
  return lines.join('\n');
}

/** パイプラインが書き込めるファイル（ai-output.mjs の ALLOWED_DIRS / ALLOWED_EXT / FORBIDDEN_PREFIXES と同じ条件） */
export function isPipelineWritable(p) {
  return (
    /^(app|components|lib|hooks|types)\//.test(p) &&
    /\.(tsx?|css)$/.test(p) &&
    !/^(app\/admin|app\/api\/admin|components\/admin|lib\/admin)\//.test(p)
  );
}

const PATH_RE = /[A-Za-z0-9_@\-\[\]().\/]+\.(?:tsx?|mjs|js|css|json|ya?ml|md)\b/g;
/** パスの直後がこれなら任意のファイル（例: `lib/x.ts`（任意）、`lib/x.ts`（必要なら）） */
const OPTIONAL_AFTER = /^`?\s*[（(]\s*(?:任意|必要なら|必要に応じて|あれば)/;
/** パスの直前がこれなら代替のファイル（例: （または `lib/x.ts`）、A に作るか、`B` を新規作成） */
const OPTIONAL_BEFORE = /(?:または|か、)\s*`?$/;

/**
 * タスク本文の「対象ファイル」欄からファイルを取り出す。
 * 戻り値: { required: string[], optional: string[] }（どちらもパイプラインが書き込めるファイルだけ）。
 * 「対象ファイル」欄が無ければ null。
 */
export function taskTargetFiles(taskBlock) {
  const lines = taskBlock.split('\n');
  const start = lines.findIndex((l) => l.includes('対象ファイル'));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !/^\s*- \*\*/.test(lines[end])) end++;
  const required = new Set();
  const optional = new Set();
  for (const line of lines.slice(start, end)) {
    for (const m of line.matchAll(PATH_RE)) {
      const p = m[0].replace(/^\.\//, '');
      if (!isPipelineWritable(p)) continue;
      const before = line.slice(Math.max(0, m.index - 12), m.index);
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + 20);
      if (OPTIONAL_AFTER.test(after) || OPTIONAL_BEFORE.test(before)) optional.add(p);
      else required.add(p);
    }
  }
  for (const p of required) optional.delete(p);
  return { required: [...required], optional: [...optional] };
}

/** 最初の未完了タスクを完了 (`- [x]`) にした内容を返す */
export function markFirstOpenTaskDone(content) {
  const task = firstOpenTask(content);
  if (!task) return null;
  const lines = content.split('\n');
  lines[task.startIndex] = task.line.replace(/^- \[ \] /, '- [x] ');
  return { content: lines.join('\n'), line: task.line };
}
