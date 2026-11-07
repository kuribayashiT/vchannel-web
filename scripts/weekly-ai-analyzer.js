// scripts/weekly-ai-analyzer.js
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

  const prompt = `
あなたは「Vちゃんねる」のプロダクトデザイナー兼AIプロンプトエンジニアです。
以下の資料をもとに、競合サイト（data.vmato.jp）に勝つための新しい改善タスクを1件だけ考案し、COPILOT_TASK.md の「未完了タスク (To Do)」の適切なセクション（P0またはP1）に追記してください。

## AGENTS.md
${agentsMd}

## FRONTEND_SPEC.md
${frontendSpec}

## 現在の COPILOT_TASK.md
${copilotTask}

## 指示
- すでに記載されているタスクと重複しないものを1件選定してください。
- 以下のフォーマットで追記した【更新後の COPILOT_TASK.md 全体の内容】のみをマークダウン形式で出力してください（余計な解説文は不要です）。

- [ ] **P0-X. タスク名**
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
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  if (!data.content || !data.content[0]) {
    console.error('API Error:', data);
    process.exit(1);
  }

  const updatedContent = data.content[0].text.replace(/```markdown/g, '').replace(/```/g, '').trim();
  fs.writeFileSync('COPILOT_TASK.md', updatedContent, 'utf8');
  console.log('Successfully updated COPILOT_TASK.md with a new task.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});