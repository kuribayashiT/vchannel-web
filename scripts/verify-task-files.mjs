// ビルド成功後、タスクを完了にする前に「対象ファイルが実際に変更されたか」を検査する。
//
// 背景: 2026-11-08 に CHAT-1 が、RankingTabs.tsx だけを変えた実行で `[x]` になった（CHAT-2・DOMAIN-2 なども一部しか
// 実装されずに完了扱い）。ビルドは「何も変えなくても」通るため、ビルド成功だけでは完了の根拠にならない。
//
// 使い方（.github/workflows/weekly-analysis.yml の Step 4）:
//   node scripts/verify-task-files.mjs           検査する。不合格なら理由を $RUNNER_TEMP/verify-task.json に書いて exit 1
//   node scripts/verify-task-files.mjs --note    上の JSON を読み、タスクの直下に失敗メモを追記する
//                                                （変更を捨てた後に呼ぶ。COPILOT_TASK.md 以外は触らない）
//
// 合格条件:
//   1. app/ components/ lib/ hooks/ types/ 配下のファイルが 1 つ以上変更・新規作成されている
//   2. 「対象ファイル」欄の必須ファイル（パイプラインが書き込めるもの）がすべて変更・新規作成されている
//      必須にしないファイルは、タスク側で `（任意）` `（必要なら）` を後ろに付けるか、`または` の後に書く
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  firstOpenTask,
  insertNoteAfterFirstOpenTask,
  readTaskFile,
  taskTargetFiles,
  writeTaskFileSafely,
} from './task-md.mjs';

const RESULT_FILE = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'verify-task.json');

/** 作業ツリーで変更・追加・削除されたファイル（未追跡を含む） */
function changedFiles() {
  const out = execFileSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], {
    encoding: 'utf8',
  });
  const files = [];
  const parts = out.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i].slice(0, 2);
    files.push(parts[i].slice(3));
    if (status.startsWith('R') || status.startsWith('C')) i++; // リネーム元のパスを読み飛ばす
  }
  return files;
}

function verify() {
  const task = firstOpenTask(readTaskFile());
  if (!task) {
    console.log('未完了タスクがないため、検査しません。');
    return;
  }
  const changed = changedFiles();
  const source = changed.filter((f) => /^(app|components|lib|hooks|types)\//.test(f));
  const targets = taskTargetFiles(task.block);
  const required = targets ? targets.required : [];
  const missing = required.filter((f) => !changed.includes(f));

  console.log(`タスク: ${task.line}`);
  console.log(`変更されたソース (${source.length}): ${source.join(', ') || 'なし'}`);
  console.log(`必須の対象ファイル (${required.length}): ${required.join(', ') || 'なし'}`);
  if (targets?.optional.length) console.log(`任意の対象ファイル: ${targets.optional.join(', ')}`);

  const reasons = [];
  if (!source.length) reasons.push('ソースファイルが 1 つも変更されていない');
  if (missing.length) reasons.push(`必須の対象ファイルが変更されていない: ${missing.map((f) => `\`${f}\``).join('、')}`);

  if (!reasons.length) {
    console.log('✅ 対象ファイルの検査に合格しました。');
    return;
  }
  fs.writeFileSync(RESULT_FILE, JSON.stringify({ line: task.line, reasons, changed: source }), 'utf8');
  console.log(`❌ 対象ファイルの検査に不合格:\n  ${reasons.join('\n  ')}`);
  process.exit(1);
}

function writeNote() {
  if (!fs.existsSync(RESULT_FILE)) {
    console.log('検査結果がないため、失敗メモは追記しません。');
    return;
  }
  const result = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8'));
  const before = readTaskFile();
  const task = firstOpenTask(before);
  if (!task || task.line !== result.line) {
    console.log('検査したタスクと先頭の未完了タスクが一致しないため、失敗メモは追記しません。');
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const note = [
    `  - **🤖 自動実装の失敗メモ（${date}・対象ファイル未変更）**: ビルドは通ったが、対象ファイルの検査に不合格のため変更を捨てた。完了にはしていない。`,
    ...result.reasons.map((r) => `    - ${r}`),
    `    - 今回変更されたソース: ${result.changed.length ? result.changed.map((f) => `\`${f}\``).join('、') : 'なし'}`,
    `    - 変更不要なファイルがあるなら、PM がタスクの対象ファイルに \`（任意）\` を付ける。`,
  ].join('\n');
  writeTaskFileSafely(before, insertNoteAfterFirstOpenTask(before, note));
  console.log(`失敗メモを追記しました: ${task.line}`);
}

if (process.argv.includes('--note')) writeNote();
else verify();
