import fs from 'fs';
import path from 'path';
import { appendToAiSection, unwrapOuterFence, writeTaskFileSafely } from './task-md.mjs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

async function main() {
  const agentsMd = fs.existsSync('AGENTS.md') ? fs.readFileSync('AGENTS.md', 'utf8') : '';
  const frontendSpec = fs.existsSync('FRONTEND_SPEC.md') ? fs.readFileSync('FRONTEND_SPEC.md', 'utf8') : '';
  const copilotTask = fs.existsSync('COPILOT_TASK.md') ? fs.readFileSync('COPILOT_TASK.md', 'utf8') : '';

  const prompt = `
あなたは「Vちゃんねる」のプロダクトデザイナー兼AIプロンプトエンジニアです。
以下の資料をもとに、競合サイト（data.vmato.jp）に勝つための新しい改善タスクを1件だけ考案してください。
タスクはスクリプトが COPILOT_TASK.md 末尾の「AI 提案タスク」セクションに追記します。

## AGENTS.md
${agentsMd}

## FRONTEND_SPEC.md
${frontendSpec}

## 現在の COPILOT_TASK.md
${copilotTask}

## 指示
- すでに記載されているタスク（完了済みを含む）と重複しないものを1件選定してください。
- **追記する新しいタスク 1 件の Markdown だけ**を出力してください。COPILOT_TASK.md 全体や既存のタスクは出力しないでください。解説文も不要です。
- 1 行目は必ず \`- [ ] **AI-YYYYMMDD. タスク名**\` の形にしてください（YYYYMMDD は今日の日付）。
- 2 行目以降は、次の形式で 2 スペース字下げしてください。

- [ ] **AI-YYYYMMDD. タスク名**
  - **対象ファイル**: \`components/Example.tsx\`
  - **仕様**: 〇〇を実装・修正する。
  - **完了条件**: \`npm run build\` が成功すること。
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
      max_tokens: 16384,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('API Error Response:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  let textOutput = '';
  if (data.content && Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === 'text') {
        textOutput += block.text;
      }
    }
  }

  if (!textOutput) {
    console.error('API Error: レスポンス内に有効なテキストコンテンツがありませんでした。', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const block = unwrapOuterFence(textOutput);
  const firstLine = block.split('\n')[0];
  if (!/^- \[ \] \*\*.+\*\*/.test(firstLine)) {
    console.error('AI の出力がタスク形式ではないため、COPILOT_TASK.md は変更しません。\n', textOutput);
    return;
  }
  if (copilotTask.includes(firstLine)) {
    console.log('同じタスクが既にあるため、追記しません:', firstLine);
    return;
  }
  try {
    writeTaskFileSafely(copilotTask, appendToAiSection(copilotTask, block));
    console.log('Successfully appended a new task to COPILOT_TASK.md:', firstLine);
  } catch (e) {
    // タスク追加に失敗しても、その日の自動実装は止めない
    console.error(e.message);
  }
}

main().catch(err => {
  console.error('Unhandled Error:', err);
  process.exit(1);
});