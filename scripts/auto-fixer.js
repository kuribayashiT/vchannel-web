import fs from 'fs';
import path from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function fixCode() {
  const errorLog = fs.existsSync('tsc_errors.log') ? fs.readFileSync('tsc_errors.log', 'utf8') : '';
  
  if (!errorLog) {
    console.log('エラーログが見つかりませんでした。');
    return;
  }

  const prompt = `
あなたは Next.js (App Router) + TypeScript + Tailwind CSS のプロフェッショナルなフロントエンドエンジニアです。
直前の自動ビルド（型チェック）で以下のエラーが発生しました。

## エラーログ
${errorLog}

このエラーを解決するために、エラーログに含まれている該当ファイル（複数ある場合はすべて）を特定し、型定義の追加や足りないインポート（例: lucide-react のアイコンなど）を適切に修正した【修正後のファイルコード全体】を出力してください。

出力形式は以下のJSON形式（コードブロックなしのプレーンなJSON）でお願いします：
[
  {
    "filePath": "app/api/vtuber/[channelId]/route.ts",
    "content": "修正後のファイルの中身全体..."
  }
]
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
      max_tokens: 8192,
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
    // JSON部分を抽出してファイルに反映
    const jsonMatch = textOutput.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('有効なJSON配列が見つかりませんでした');
    }
    const fixes = JSON.parse(jsonMatch[0]);

    for (const fix of fixes) {
      if (fix.filePath && fix.content) {
        fs.writeFileSync(fix.filePath, fix.content, 'utf8');
        console.log(`Successfully fixed: ${fix.filePath}`);
      }
    }
  } catch (e) {
    console.error('Failed to parse AI response or apply fixes:', e);
    console.log('Raw output:', textOutput);
  }
}

fixCode().catch(err => {
  console.error(err);
  process.exit(1);
});