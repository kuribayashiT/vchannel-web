import fs from 'fs';
import { firstOpenTask, taskTargetFiles } from './task-md.mjs';
import { buildTaskContext, sourceFileTree } from './context-files.mjs';
import {
  MAX_FILES,
  OUTPUT_FORMAT_INSTRUCTIONS,
  appendSpecs,
  callClaude,
  parseAiOutput,
  writeFiles,
} from './ai-output.mjs';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

async function main() {
  const agentsMd = fs.existsSync('AGENTS.md') ? fs.readFileSync('AGENTS.md', 'utf8') : '';
  const frontendSpec = fs.existsSync('FRONTEND_SPEC.md') ? fs.readFileSync('FRONTEND_SPEC.md', 'utf8') : '';
  const copilotTask = fs.existsSync('COPILOT_TASK.md') ? fs.readFileSync('COPILOT_TASK.md', 'utf8') : '';
  // COPILOT_TASK.md 全文はプロンプトに入れない（今回のタスク本文だけを渡す。トークン節約のため）

  // 実装するタスクは「ファイル内で最初の未完了タスク」に固定する。
  // ビルド成功時の完了マーク（scripts/mark-task-done.mjs）と失敗メモ（scripts/task-fallback.js）も同じタスクを対象にする。
  const target = firstOpenTask(copilotTask);
  if (!target) {
    console.log('未完了タスクがないため、自動実装をスキップします。');
    return;
  }
  console.log(`実装対象タスク: ${target.line}`);

  // ソースはタスクに関係するファイルだけを渡す（全ファイルを送るとトークンの大半を占めるため）
  const { context: sourceCodeContext, files: contextFiles } = buildTaskContext(target.block);
  console.log(`コンテキストに含めるファイル (${contextFiles.length} 件):\n  ${contextFiles.join('\n  ')}`);
  const fileTree = sourceFileTree();
  // 完了前に scripts/verify-task-files.mjs が「必須の対象ファイルがすべて変わったか」を検査する。AI にも明示しておく
  const targets = taskTargetFiles(target.block);
  const requiredNote = targets && targets.required.length
    ? "必須の対象ファイル（すべて変更・新規作成すること。1 つでも変わっていないと完了にならず、変更は捨てられます）: " +
      targets.required.map((f) => `\`${f}\``).join("、") +
      (targets.optional.length ? "\n任意の対象ファイル（必要な場合だけ変更）: " + targets.optional.map((f) => `\`${f}\``).join("、") : "")
    : "";

  const prompt = "あなたは Next.js (App Router) + TypeScript + Tailwind CSS のプロフェッショナルなフロントエンドエンジニアです。\n" +
    "以下のプロジェクト資料および既存のソースコードを理解した上で、次のタスクを**仕様のすべての項目について**実装してください。ほかのタスクには手を付けないでください。\n\n" +
    "## 🎯 今回実装するタスク\n" + target.block + "\n\n" + (requiredNote ? requiredNote + "\n\n" : "") +
    "## AGENTS.md\n" + agentsMd + "\n\n" +
    "## FRONTEND_SPEC.md\n" + frontendSpec + "\n\n" +
    "## 📁 プロジェクトのソースファイル一覧（パスのみ。存在しないファイルをインポートしないための参考）\n" + fileTree + "\n\n" +
    "## 📂 タスクに関係する既存のソースコード（対象ファイルと、そこから読み込んでいるファイル）\n" + (sourceCodeContext || "（タスク本文に既存ファイルの指定なし）") + "\n\n" +
    "## 🛑 絶対守るべきルール（禁止事項・制限）\n" +
    "1. タスクの「対象ファイル」に書かれたファイルは、必要なものをすべて変更・新規作成してください。1 ファイルにまとめて済ませず、タスクが指定したファイル構成に従ってください。\n" +
    `2. 変更・新規作成するファイルは最大 ${MAX_FILES} つまでです。タスクに必要なファイルだけにし、関係のないファイルは変更しないでください。\n` +
    "3. マークダウン（.md）ファイルはファイルとして出力しないでください。仕様書の更新が必要な場合は、出力形式の SPEC ブロックで追記内容だけを出力してください。\n" +
    "4. 外部仕様書やJSONのデータをそのまま出力に含めないでください。\n\n" +
    "## ⚠️ コーディングの絶対ルール（型エラー・ビルドエラー防止のため必須）\n" +
    "- Next.js の Server Component / API Route / Page を作成・修正する際は、**絶対にグローバル型（`RouteContext`, `PageProps`, `LayoutProps` 等）に頼らず、必ずファイル内で次のように型を明示的に定義**してください：\n" +
    "  - RouteContext: `type RouteContext = { params: Promise<{ channelId: string }> };`\n" +
    "  - PageProps: `type PageProps = { params: Promise<{ channelId: string }> };`\n" +
    "  - LayoutProps: `type LayoutProps = { children: React.ReactNode };`\n" +
    "- 存在しないモジュールや関数を勝手に捏造してインポートしないでください（`lucide-react` などの実在するアイコンのみ使用可）。上の「ソースファイル一覧」にないファイルは、今回 FILE ブロックで新規作成するもの以外インポートできません。\n" +
    "- 既存のコードを破壊せず、確実に `tsc --noEmit` および `npm run build` が通るコードを出力してください。\n\n" +
    OUTPUT_FORMAT_INSTRUCTIONS;

  const textOutput = await callClaude(prompt);
  const out = parseAiOutput(textOutput);

  try {
    writeFiles(out.files);
  } catch (e) {
    console.error('AI の出力を反映できませんでした:', e.message);
    console.log('Raw output (先頭 3000 文字):', textOutput.slice(0, 3000));
    process.exit(1);
  }

  // 仕様書の追記は失敗しても実装自体は止めない
  let specApplied = [];
  try {
    specApplied = appendSpecs(out.specs);
  } catch (e) {
    console.error(e.message);
  }

  // ワークフロー側の PR 本文用サマリー
  const summaryText = [
    `### 🚀 自動実装の成果`,
    `- **タスク**: ${target.line.replace(/^- \[ \] /, '')}`,
    `- **変更したファイル**:`,
    ...out.files.map((f) => `  - \`${f.filePath}\``),
    ...(specApplied.length ? [`- **仕様書の追記**: ${specApplied.map((h) => `\`${h}\``).join('、')}`] : []),
    `- **改善内容**: ${out.summary || '（要約なし）'}`,
  ].join('\n');
  fs.writeFileSync('task_summary.txt', summaryText, 'utf8');
}

main().catch(err => {
  console.error('Unhandled Error:', err);
  process.exit(1);
});
