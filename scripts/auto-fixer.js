import fs from 'fs';
import path from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function fixCode() {
  const errorLog = fs.existsSync('tsc_errors.log') ? fs.readFileSync('tsc_errors.log', 'utf8') : '';
  
  // エラーに関係していそうな主要ファイルをいくつか読み込む（またはエラー文から動的に特定）
  const targetFile = errorlog.includes('route.ts') ? 'app/api/vtuber/[channelId]/route.ts' : '';
  // ※実際にはエラーログのパスを正規表現等で抽出すれば、どのファイルが壊れているか特定できます
  
  const prompt = `
あなたはTypeScript/Next.jsのプロフェッショナルです。
直前の自動ビルド（型チェック）で以下のエラーが発生しました。

## エラーログ
${errorLog}

上記のエラーを解決するために、該当するファイルのコードを修正し、修正後のファイル全体のコードのみを出力してください。
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
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  // レスポンスからコードを抽出し、ファイルを上書き保存する処理...
}

fixCode();