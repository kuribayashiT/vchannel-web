// ビルド成功時に、auto-coder が実装した「最初の未完了タスク」だけを完了 (`- [x]`) にする。
import { markFirstOpenTaskDone, readTaskFile, writeTaskFileSafely } from './task-md.mjs';

const before = readTaskFile();
const result = markFirstOpenTaskDone(before);
if (!result) {
  console.log('未完了タスクがないため、何もしません。');
} else {
  writeTaskFileSafely(before, result.content, { checkedLine: result.line });
  console.log(`✅ 完了に更新しました: ${result.line}`);
}
