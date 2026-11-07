import fs from 'fs';
import path from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

async function fixCode() {
  const errorLog = fs.existsSync('tsc_errors.log') ? fs.readFileSync('tsc_errors.log', 'utf8') : '';
  
  if (!errorLog) {
    console.log('エラーログが見つかりませんでした。');
    return;
  }

  // エラーログから該当するファイルパスを自動抽出して中身を読み込む
  const fileMatches = errorLog.matchAll(/^([a-zA-Z0-9_\-\/.]+\.(ts|tsx|js|jsx))/gm);
  const targetFiles = [...new Set([...fileMatches].map(m => m[1]))];

  let fileContentsContext = '';
  for (const filePath of targetFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      fileContentsContext += `\n### ファイル: ${filePath}\n\`\`\`ts\n${content}\n\`\`\`\n`;
    }
  }

  // デフォルトでよくあるファイルも念のため追加
  const fallbackFiles = ['components/AppShell.tsx', 'components/BottomNav.tsx'];
  for (const filePath of fallbackFiles) {
    if (!targetFiles.includes(filePath) && fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      fileContentsContext += `\n### ファイル: ${filePath}\n\`\`\`ts\n${content}\n\`\`\`\n`;
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
    "3. インポートエラーや名前解決エラーは、該当ファイルを正確に修正して解決してください。\n" +
    "4. **絶対に解説文や挨拶などの余計なテキストを出力せず、純粋なJSON配列のみを出力してください。**\n\n" +
    "## 出力形式\n" +
    "修正するファイルごとに、以下のJSON配列の形式（コードブロックなしのプレーンなJSON）で出力してください。解説文は一切不要です。\n\n" +
    "[\n  {\n    \"filePath\": \"app/api/vtuber/[channelId]/route.ts\",\n    \"content\": \"修正後のファイルの中身全体...\"\n  }\n]";

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
  if (!response.ok || !data.content) {
    console.error('API Error:', data);
    process.exit(1);
  }

  let textOutput = '';
  for (const block of data.content) {
    if (block.type === 'text') {
      textOutput += block.text;
    }
  }

  try {
    const jsonMatch = textOutput.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('有効なJSON配列が見つかりませんでした');
    }
    const fixes = JSON.parse(jsonMatch[0]);

    for (const fix of fixes) {
      if (fix.filePath && fix.content) {
        const dir = path.dirname(fix.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fix.filePath, fix.content, 'utf8');
        console.log(`Successfully fixed: ${fix.filePath}`);
      }
    }
  } catch (e) {
    console.error('Failed to parse AI response or apply fixes:', e);
    console.log('Raw output:', textOutput);
    process.exit(1);
  }
}

fixCode().catch(err => {
  console.error(err);
  process.exit(1);
});