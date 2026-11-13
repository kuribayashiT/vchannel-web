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
 * ファイル内で最初の未完了タスク（行頭が `- [ ] `）を返す。
 * auto-coder・完了マーク・失敗メモはすべてこの関数で対象を決め、ずれないようにする。
 */
export function firstOpenTask(content) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => OPEN_TASK_LINE.test(l));
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

/** 最初の未完了タスクを完了 (`- [x]`) にした内容を返す */
export function markFirstOpenTaskDone(content) {
  const task = firstOpenTask(content);
  if (!task) return null;
  const lines = content.split('\n');
  lines[task.startIndex] = task.line.replace(/^- \[ \] /, '- [x] ');
  return { content: lines.join('\n'), line: task.line };
}
