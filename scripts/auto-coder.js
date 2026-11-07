import fs from 'fs';
import path from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

async function main() {
  const agentsMd = fs.existsSync('AGENTS.md') ? fs.readFileSync('AGENTS.md', 'utf8') : '';
  const frontendSpec = fs.existsSync('FRONTEND_SPEC.md') ? fs.readFileSync('FRONTEND_SPEC.md', 'utf8') : '';
  const copilotTask = fs.existsSync('COPILOT_TASK.md') ? fs.readFileSync('COPILOT_TASK.md', 'utf8') : '';

  const prompt = "あなたは Next.js (App Router) + TypeScript + Tailwind CSS のプロフェッショナルなフロントエンドエンジニアです。\n" +
    "以下の資料（AGENTS.md, FRONTEND_SPEC.md）および COPILOT_TASK.md の「未完了タスク (- [ ])」の中から、最優先のタスクを1件だけピックアップして実装してください。\n\n" +
    "## AGENTS.md\n" + agentsMd + "\n\n" +
    "## FRONTEND_SPEC.md\n" + frontendSpec + "\n\n" +
    "## COPILOT_TASK.md\n" + copilotTask + "\n\n" +
    "## 🛑 絶対守るべきルール（禁止事項・制限）\n" +
    "1. AGENTS.md, FRONTEND_SPEC.md, COPILOT_TASK.md などのマークダウン（.md）ファイルは、**絶対に新規作成・変更・出力してはなりません**。変更は app/ や components/ などのソースコード（.ts, .tsx）のみに限定してください。\n" +
    "2. 外部仕様書やJSONのデータをそのまま出力に含めないでください。必要な型定義はコード内に直接記述してください。\n\n" +
    "## ⚠️ コーディングの絶対ルール\n" +
    "- Next.js の Server Component / API Route を作成する際は、RouteContext, LayoutProps, PageProps などのグローバル型に依存せず、必ずファイル内で以下のように型を明示的に定義してください：\n" +
    "  - RouteContext: type RouteContext = { params: Promise<{ channelId: string }> };\n" +
    "  - PageProps: type PageProps = { params: Promise<{ channelId: string }> };\n" +
    "  - LayoutProps: type LayoutProps = { children: React.ReactNode };\n" +
    "- アイコンを使用する場合は必ず lucide-react 等から正しくインポートしてください。\n\n" +
    "## 出力形式\n" +
    "変更するソースコードファイルごとに、以下のJSON配列の形式（コードブロックなしのプレーンなJSON）で出力してください。それ以外の解説文は一切不要です。\n\n" +
    "[\n  {\n    \"filePath\": \"components/Example.tsx\",\n    \"content\": \"修正・新規作成後のファイルの中身全体...\"\n  }\n]";

    const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 8192,
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
    const jsonMatch = textOutput.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('有効なJSON配列が見つかりませんでした');
    }
    const changes = JSON.parse(jsonMatch[0]);

    for (const change of changes) {
      if (change.filePath && change.content) {
        const dir = path.dirname(change.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(change.filePath, change.content, 'utf8');
        console.log(`Successfully generated/updated: ${change.filePath}`);
      }
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