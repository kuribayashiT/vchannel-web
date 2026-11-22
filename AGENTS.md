# AI Agent Execution Guidelines

## 🤖 マルチエージェント役割分担

- **Claude Code (PM / デザイナー)**:
  - 競合サイト（`data.vmato.jp`）および Vercel Analytics の傾向を分析し、要件検討を行う。
  - 新機能の仕様や画面設計が決まったら、`FRONTEND_SPEC.md` に仕様を追加・更新する。
  - 実装すべき改善項目を `COPILOT_TASK.md` に未完了タスク（`- [ ]`）として日次で追加する。タスクには「対象ファイル」（最大 6 ファイル）・「仕様」・「完了条件」を具体的に書く。
  - アプリのコード（`app/`・`components/`・`lib/` など）は直接編集しない。ただし、自動開発パイプライン（`.github/workflows/weekly-analysis.yml`・`scripts/`）の保守と、`COPILOT_TASK.md`・`FRONTEND_SPEC.md`・`AGENTS.md` の更新とプッシュは Claude Code が行う。

- **自動開発パイプライン（実装のメイン担当）**:
  - GitHub Actions（`.github/workflows/weekly-analysis.yml`）が 1 日 3 回（JST 9:00 / 13:00 / 18:00）、`COPILOT_TASK.md` の最初の未完了タスクを 1 件実装する。
  - タスク行に `【Copilot】` があるタスク（`backend-repo/` の変更など、パイプラインで実装できないもの）は飛ばす。
  - 1 回で変更できるのは `app/`・`components/`・`lib/`・`hooks/`・`types/` 配下の `.ts` / `.tsx` / `.css` を最大 6 ファイル。`FRONTEND_SPEC.md` は既存の見出しの節への追記のみ。
  - 型チェックとビルドが通ったらタスクを `- [x]` にし、PR を作って自動マージする。3 回直しても通らない場合は変更を捨て、タスクに失敗メモを追記する（PM がタスクを見直す）。

- **GitHub Copilot (エンジニア・補助)**:
  - 運営者から依頼されたときだけ動く。依頼も `COPILOT_TASK.md` のタスクに基づくものに限る。
  - 着手前に `git pull` し、`COPILOT_TASK.md` の未完了タスク（`- [ ]`）を上から順番に実装する。パイプラインの実行時刻（JST 9:00 / 13:00 / 18:00）の前後は、同じタスクを二重に実装しないよう避ける。
  - 実装完了後、下記の自律開発ループ（検証・ドキュメント更新）を必ず実行する。
  - 新規作成した共通コンポーネント、ユーティリティ関数、UIルール等を `FRONTEND_SPEC.md` に反映する。
  - 問題がなければ `COPILOT_TASK.md` の該当タスクを完了済み（`- [x]`）に変更し、Git Commit および Git Push まで実行する。

- **管理画面（`/admin`）の例外**:
  - 運営者向けの管理画面は、ユーザー向け機能ではないため **Claude Code が直接実装・保守する**。タスクは `ADMIN_TASK.md` で管理し、`COPILOT_TASK.md` には載せない。
  - GitHub Copilot と自動開発パイプラインは `app/admin/`、`app/api/admin/`、`components/admin/`、`lib/admin/`、`proxy.ts`、`ADMIN_TASK.md` を編集しない。
  - 記事の自動作成（`scripts/content/`、`.github/workflows/monthly-report.yml`、`.github/workflows/weekly-feature.yml`、`lib/admin/feature-data.ts`、`content/reports/`、`content/guide/`）も同じ扱いで、Claude Code が実装・保守する。

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