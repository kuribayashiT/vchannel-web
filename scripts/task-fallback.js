import fs from 'fs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function updateTaskOnFailure() {
  const errorLog = fs.existsSync('tsc_errors.log') ? fs.readFileSync('tsc_errors.log', 'utf8') : '';
  const copilotTask = fs.existsSync('COPILOT_TASK.md') ? fs.readFileSync('COPILOT_TASK.md', 'utf8') : '';

  const prompt = `
あなたは自律開発AIのエージェントです。
直近の自動実装およびセルフヒーリング（3回のリトライ）を試みましたが、以下のビルドエラーが解消できず実装に失敗しました。

## 発生したエラーログ（最後の状態）
${errorLog}

## 現在の COPILOT_TASK.md
${copilotTask}

## 指示
1. 今回失敗したアプローチではうまくいかなかったため、該当する未完了タスクの「仕様」や「アプローチ」を、より堅実で別のやり方に書き換えてください。
2. タスクを完了済み（- [x]）にしてはいけません。未完了（- [ ]）のまま、アプローチを変更した状態にしてください。
3. 変更後の COPILOT_TASK.md 全体の内容のみをマークダウン形式で出力してください。
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
  let textOutput = '';
  if (data.content && Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === 'text') textOutput += block.text;
    }
  }

  if (textOutput) {
    const updated = textOutput.replace(/```markdown/g, '').replace(/```/g, '').trim();
    fs.writeFileSync('COPILOT_TASK.md', updated, 'utf8');
    console.log('Successfully updated COPILOT_TASK.md with a new approach.');
  }
}

updateTaskOnFailure().catch(console.error);