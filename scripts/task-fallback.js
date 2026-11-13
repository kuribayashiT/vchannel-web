import fs from 'fs';
import {
  firstOpenTask,
  insertNoteAfterFirstOpenTask,
  readTaskFile,
  unwrapOuterFence,
  writeTaskFileSafely,
} from './task-md.mjs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// 自動実装が 3 回失敗したときに呼ばれる。
// COPILOT_TASK.md 全体は書き換えない。失敗したタスク（= 最初の未完了タスク）の直下に
// 「失敗メモ」を追記するだけにする。タスクの仕様の書き換えは PM（Claude Code）が行う。
async function updateTaskOnFailure() {
  const errorLog = fs.existsSync('tsc_errors.log') ? fs.readFileSync('tsc_errors.log', 'utf8') : '';
  const copilotTask = readTaskFile();
  const task = firstOpenTask(copilotTask);
  if (!task) {
    console.log('未完了タスクがないため、失敗メモは追記しません。');
    return;
  }

  const prompt = `
あなたは自律開発AIのエージェントです。
次のタスクの自動実装とセルフヒーリング（3回のリトライ）を試みましたが、ビルドエラーが解消できず失敗しました。

## 失敗したタスク
${task.block}

## 発生したエラーログ（最後の状態、先頭 4000 文字）
${errorLog.slice(0, 4000)}

## 指示
- 失敗の原因の見立てと、次に試すべき別のアプローチを、日本語の箇条書き 3〜6 行で書いてください。
- 箇条書きの各行は「- 」で始め、1 行 120 文字以内にしてください。
- タスクの本文や COPILOT_TASK.md は出力しないでください。見出しやコードブロックも使わないでください。
`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  let textOutput = '';
  if (data.content && Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === 'text') textOutput += block.text;
    }
  }

  const bullets = unwrapOuterFence(textOutput)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .slice(0, 6);
  if (bullets.length === 0) bullets.push('- （AI による原因の見立ては取得できませんでした）');

  const date = new Date().toISOString().slice(0, 10);
  const note = [
    `  - **🤖 自動実装の失敗メモ（${date}）**: ビルドが 3 回失敗したため、変更をロールバックした。PM が仕様を見直すまで同じタスクで再挑戦する。`,
    ...bullets.map((b) => `    ${b}`),
  ].join('\n');

  const updated = insertNoteAfterFirstOpenTask(copilotTask, note);
  writeTaskFileSafely(copilotTask, updated);
  console.log(`失敗メモを追記しました: ${task.line}`);
}

updateTaskOnFailure().catch((e) => {
  // 失敗メモの追記に失敗しても COPILOT_TASK.md は壊さない（書き込み前に終了する）
  console.error(e);
});
