// scripts/auto-coder.js
import fs from 'fs';
import path from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

async function main() {
  const copilotTask = fs.readFileSync('COPILOT_TASK.md', 'utf8');
  const frontendSpec = fs.readFileSync('FRONTEND_SPEC.md', 'utf8');
  const agentsMd = fs.existsSync('AGENTS.md') ? fs.readFileSync('AGENTS.md', 'utf8') : '';

  const prompt = `
あなたは Next.js (App Router) + TypeScript + Tailwind CSS のフロントエンドエンジニアです。
以下の COPILOT_TASK.md から、最優先の【未完了タスク (- [ ])】を1件だけピックアップして実装してください。

## AGENTS.md
${agentsMd}

## FRONTEND_SPEC.md
${frontendSpec}

## COPILOT_TASK.md
${copilotTask}

## 出力要件
Claudeの出力として、以下のJSON形式のみを返してください（マークダウンのバッククォート \`\`\`json ... \`\`\` で囲んでください）。

{
  "taskId": "該当するタスク名（COPILOT_TASK.md上の表記）",
  "filesToModify": [
    {
      "path": "変更または新規作成するファイルパス",
      "content": "ファイルの完全な新しいコード内容"
    }
  ],
  "updatedFrontendSpec": "今回の実装を反映した更新後の FRONTEND_SPEC.md の全体内容",
  "updatedCopilotTask": "該当タスクを [x] に変更し、Doneに移動またはチェックを入れた更新後の COPILOT_TASK.md の全体内容"
}
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
  if (!data.content || !data.content[0]) {
    console.error('API Error:', data);
    process.exit(1);
  }

  let textResponse = data.content[0].text;
  const jsonMatch = textResponse.match(/```json([\s\S]*?)```/) || textResponse.match(/\{([\s\S]*)\}/);
  if (!jsonMatch) {
    console.error('Failed to parse JSON from Claude response.');
    process.exit(1);
  }

  const jsonString = jsonMatch[1] ? jsonMatch[1] : jsonMatch[0];
  const result = JSON.parse(jsonString);

  // ファイルの書き込み
  for (const file of result.filesToModify) {
    const dir = path.dirname(file.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file.path, file.content, 'utf8');
    console.log(`Updated/Created file: ${file.path}`);
  }

  // 仕様書とタスク表の更新
  if (result.updatedFrontendSpec) {
    fs.writeFileSync('FRONTEND_SPEC.md', result.updatedFrontendSpec, 'utf8');
    console.log('Updated FRONTEND_SPEC.md');
  }
  if (result.updatedCopilotTask) {
    fs.writeFileSync('COPILOT_TASK.md', result.updatedCopilotTask, 'utf8');
    console.log('Updated COPILOT_TASK.md');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});