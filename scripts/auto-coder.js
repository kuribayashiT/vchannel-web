import fs from 'fs';
import path from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

// 指定ディレクトリから主要なソースコード（動的ルート等の括弧付きも含めて）を再帰的に読み込む
function loadSourceFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        loadSourceFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts' ) || file.endsWith('.tsx')) {
      const content = fs.readFileSync(filePath, 'utf8');
      fileList.push(`### File: ${filePath}\n\`\`\`tsx\n${content}\n\`\`\`\n`);
    }
  }
  return fileList;
}

async function main() {
  const agentsMd = fs.existsSync('AGENTS.md') ? fs.readFileSync('AGENTS.md', 'utf8') : '';
  const frontendSpec = fs.existsSync('FRONTEND_SPEC.md') ? fs.readFileSync('FRONTEND_SPEC.md', 'utf8') : '';
  const copilotTask = fs.existsSync('COPILOT_TASK.md') ? fs.readFileSync('COPILOT_TASK.md', 'utf8') : '';

  console.log('既存のソースコードをスキャン中...');
  const sourceCodeContext = [
    ...loadSourceFiles('app'),
    ...loadSourceFiles('components')
  ].join('\n');

  const prompt = "あなたは Next.js (App Router) + TypeScript + Tailwind CSS のプロフェッショナルなフロントエンドエンジニアです。\n" +
    "以下のプロジェクト資料および既存のソースコード構造を完全に理解した上で、COPILOT_TASK.md の「未完了タスク (- [ ])」の中から、最優先のタスクを1件だけピックアップして正確に実装してください。\n\n" +
    "## AGENTS.md\n" + agentsMd + "\n\n" +
    "## FRONTEND_SPEC.md\n" + frontendSpec + "\n\n" +
    "## COPILOT_TASK.md\n" + copilotTask + "\n\n" +
    "## 📂 既存のソースコード（参考コンテキスト）\n" + sourceCodeContext + "\n\n" +
    "## 🛑 絶対守るべきルール（禁止事項・制限）\n" +
    "1. AGENTS.md, FRONTEND_SPEC.md, COPILOT_TASK.md などのマークダウン（.md）ファイルは、**絶対に新規作成・変更・出力してはなりません**。変更は app/ や components/ などのソースコード（.ts, .tsx）のみに限定してください。\n" +
    "2. 一度の実行で変更・作成するファイルは**必ず1ファイルのみ**にしてください。複数ファイルを同時に出力しては絶対いけません。\n" +
    "3. 外部仕様書やJSONのデータをそのまま出力に含めないでください。\n\n" +
    "## ⚠️ コーディングの絶対ルール（型エラー・ビルドエラー防止のため必須）\n" +
    "- Next.js の Server Component / API Route / Page を作成・修正する際は、**絶対にグローバル型（`RouteContext`, `PageProps`, `LayoutProps` 等）に頼らず、必ずファイル内で次のように型を明示的に定義**してください：\n" +
    "  - RouteContext: `type RouteContext = { params: Promise<{ channelId: string }> };`\n" +
    "  - PageProps: `type PageProps = { params: Promise<{ channelId: string }> };`\n" +
    "  - LayoutProps: `type LayoutProps = { children: React.ReactNode };`\n" +
    "- 存在しないモジュールや関数を勝手に捏造してインポートしないでください（`lucide-react` などの実在するアイコンのみ使用可）。\n" +
    "- 既存のコードを破壊せず、確実に `tsc --noEmit` および `npm run build` が通る完璧なコードを出力してください。\n\n" +
    "## 出力形式\n" +
    "修正・新規作成するソースコード**1ファイルのみ**を、以下のJSONオブジェクトの形式（コードブロックなしのプレーンなJSON）で出力してください。配列ではなく単一のオブジェクトにしてください。それ以外の解説文は一切不要です。\n\n" +
    "{\n  \"filePath\": \"app/vtuber/[channelId]/page.tsx\",\n  \"summary\": \"〇〇だった実装を、✕✕に改善しました。\",\n  \"content\": \"修正・新規作成後のファイルの中身全体...\"\n}";

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

  try {
    const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('有効なJSONオブジェクトが見つかりませんでした');
    }
    const change = JSON.parse(jsonMatch[0]);

    if (change.filePath && change.content) {
      const dir = path.dirname(change.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(change.filePath, change.content, 'utf8');
      console.log(`Successfully generated/updated: ${change.filePath}`);

      // ワークフロー側のPR本文用サマリーファイルに出力（詳細な変更理由・概要を含める）
      const summaryDescription = change.summary || "コンポーネントの仕様改善・リファクタリングを実施しました。";
      const summaryText = `### 🚀 本日の自動実装成果\n- **対象ファイル**: \`${change.filePath}\`\n- **改善内容**: ${summaryDescription}`;
      fs.writeFileSync('task_summary.txt', summaryText, 'utf8');
    } else {
      throw new Error('JSONの形式が正しくありません (filePath または content がありません)');
    }

  } catch (e) {
    console.error('Failed to parse AI response or apply code changes:', e);
    console.log('Raw output:', textOutput);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled Error:', err);
  process.exit(1);
});