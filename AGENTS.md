# AI Agent Execution Guidelines

## 🤖 マルチエージェント役割分担

- **Claude Code (PM / デザイナー)**:
  - 競合サイト（`data.vmato.jp`）および Vercel Analytics の傾向を分析し、要件検討を行う。
  - 新機能の仕様や画面設計が決まったら、`FRONTEND_SPEC.md` に仕様を追加・更新する。
  - 実装すべき改善項目を `COPILOT_TASK.md` に未完了タスク（`- [ ]`）として日次で追加する。
  - 直接コードの編集やGit Pushは行わない。

- **GitHub Copilot (エンジニア)**:
  - `COPILOT_TASK.md` に記載されている未完了タスク（`- [ ]`）を上から順番に実装する。
  - 実装完了後、下記の自律開発ループ（検証・ドキュメント更新）を必ず実行する。
  - 新規作成した共通コンポーネント、ユーティリティ関数、UIルール等を `FRONTEND_SPEC.md` に反映する。
  - 問題がなければ `COPILOT_TASK.md` の該当タスクを完了済み（`- [x]`）に変更し、Git Commit および Git Push まで実行する。

## 📋 自律開発ループルール
タスクの指示を受けた際、以下のステップを必ず自律的に完遂してください。

1. **実装 (Develop)**: `FRONTEND_SPEC.md` および仕様に従いコードを実装する。
2. **検証 (Test & Build)**: 以下のコマンドをターミナルで実行して自らテストする。
   - `npx tsc --noEmit` (型チェック)
   - `npm run build` (Next.jsビルド検証)
3. **分析 (Analyze)**: ビルドや型チェックでエラーが出た場合、ログを解析して原因を特定する。
4. **改善 (Refine)**: エラーが完全に解消されるまで修正コードを生成し、再度検証を行う。
5. **仕様書更新 (Document)**: 実装によって変更・追加されたUIコンポーネントや仕様を `FRONTEND_SPEC.md` に反映する。
6. **完了条件**: エラーなしで `npm run build` が成功し、`FRONTEND_SPEC.md` と `COPILOT_TASK.md` の更新が完了した場合のみ、Git Pushと完了報告を行う。

## 🎨 共通開発・スタイリングルール
- スタイリングは Tailwind CSS を使用し、デザインの統一感を保つ。
- アイコンは Lucide-react を優先して使用する。

## バックエンドの参照ルール
- バックエンドの処理やJSONデータの構造を確認・検証・修正する場合は、`backend-repo/functions/` 内のファイルを参照してください。