import fs from 'fs';
import { OUTPUT_FORMAT_INSTRUCTIONS, callClaude, parseAiOutput, writeFiles } from './ai-output.mjs';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

async function fixCode() {
  const errorLog = fs.existsSync('tsc_errors.log') ? fs.readFileSync('tsc_errors.log', 'utf8') : '';
  
  if (!errorLog) {
    console.log('エラーログが見つかりませんでした。');
    return;
  }

  // エラーログの行からファイルパスを抽出する（tsc 形式: path(行,列): error / Next.js ビルド形式: ./path:行:列）
  const targetFiles = new Set();
  const lines = errorLog.split('\n');
  for (const line of lines) {
    // 例: app/layout.tsx(69,56): error TS2304... のファイル名部分を抽出
    const match =
      line.match(/^([a-zA-Z0-9_\-\/.[\]()@]+)\(\d+,\d+\):\s*error/) ||
      line.match(/^\.\/([a-zA-Z0-9_\-\/.[\]()@]+\.(?:tsx?|css)):\d+:\d+/);
    if (match && match[1]) {
      targetFiles.add(match[1]);
    }
  }

  let fileContentsContext = '';
  for (const filePath of targetFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      fileContentsContext += `\n### ファイル: ${filePath}\n\`\`\`ts\n${content}\n\`\`\`\n`;
      console.log(`Auto-fixer loaded context for: ${filePath}`);
    } else {
      console.log(`Warning: Error file not found on disk: ${filePath}`);
    }
  }

  const prompt = "あなたは Next.js (App Router) + TypeScript + Tailwind CSS のプロフェッショナルなフロントエンドエンジニアです。\n" +
    "直前の自動ビルド（型チェック）で以下のエラーが発生しました。\n\n" +
    "## エラーログ\n" + errorLog + "\n\n" +
    "## 該当ファイルの現在のコード\n" + fileContentsContext + "\n\n" +
    "## 🛑 絶対守るべきルール（禁止事項・制限）\n" +
    "1. AGENTS.md, FRONTEND_SPEC.md, COPILOT_TASK.md などのマークダウン（.md）ファイルは、絶対に変更・出力してはなりません。変更はソースコード（.ts, .tsx）のみに限定してください。\n" +
    "2. Next.js の Server Component / API Route / Page を修正する際は、`RouteContext`, `PageProps`, `LayoutProps` などのグローバル型に依存せず、必ずファイル内で以下のように型を明示的に定義してください：\n" +
    "   - RouteContext: `type RouteContext = { params: Promise<{ channelId: string }> };`\n" +
    "   - PageProps: `type PageProps = { params: Promise<{ channelId: string }> };`\n" +
    "   - LayoutProps: `type LayoutProps = { children: React.ReactNode };`\n" +
    "3. 存在しないモジュールや関数を勝手に捏造してインポートしないでください。エラー解決に最低限必要な修正のみを行い、確実にビルドが通る状態にしてください。\n" +
    "4. 修正が必要なファイルだけを出力してください（エラーの原因が別ファイルにある場合はそのファイルも可）。\n\n" +
    OUTPUT_FORMAT_INSTRUCTIONS.replace(/<<<SPEC[\s\S]*?省略）\n/, '').replace(/\n- SPEC の見出し.*$/, '');

  const textOutput = await callClaude(prompt);
  try {
    writeFiles(parseAiOutput(textOutput).files);
  } catch (e) {
    console.error('Failed to apply fixes:', e.message);
    console.log('Raw output (先頭 3000 文字):', textOutput.slice(0, 3000));
    process.exit(1);
  }
}

fixCode().catch(err => {
  console.error(err);
  process.exit(1);
});