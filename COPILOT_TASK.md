# COPILOT_TASK: ランキングへの「登録者 急上昇」タブ追加および UI 改善バックログ

> 最終更新: 2026-11-07 / 担当: プロダクトデザイナー → 実装: GitHub Copilot

---

## 完了したタスク (Done)

- [x] **ランキングに「登録者 急上昇（増加数）」タブを追加する** (2026-11-03 完了)
  - 期間切替（週間/月間）、増加数・増加率・ミニ推移グラフ、GCSからのデータ取得・集計ロジックの実装。

---

## ⏳ 未完了タスク (To Do) - UI改善バックログ（data.vmato.jp 比較）

上から順に着手すること（P0 → P1 → P2）。1タスク = 1PR を目安とし、実装完了時は `[ ]` を `[x]`（または ✅）に更新すること。

### P0: 見た目の底上げ（低コスト・効果大）
- [ ] **P0-1. 絵文字アイコンを SVG アイコンに置き換え、BottomNav にアイコンを付ける**
  - 対象ファイル: `components/AppShell.tsx`, `components/BottomNav.tsx`, `package.json`
- [ ] **P0-2. 数値の短縮表記ユーティリティ**
  - 対象ファイル: 新規 `lib/format.ts`、`components/RankingTabs.tsx`, `components/GrowthTop3.tsx`, `components/VTuberTabs.tsx`, `components/VideoCard.tsx`
- [ ] **P0-3. 画像のフォールバック（壊れ画像アイコンを根絶）**
  - 対象ファイル: 新規 `components/SafeImage.tsx`、`app/news/page.tsx`, `components/VideoCard.tsx`, `components/RankingTabs.tsx`, `components/GrowthTop3.tsx`, `components/VTuberTabs.tsx`
- [ ] **P0-4. スケルトンローディング**
  - 対象ファイル: 新規 `components/Skeleton.tsx`、新規 `app/loading.tsx`, `app/ranking/loading.tsx`, `app/news/loading.tsx`, `components/StreamTabs.tsx`, `components/VTuberTabs.tsx`, `app/vtuber/[channelId]/page.tsx`
- [ ] **P0-5. セクション見出しコンポーネント**
  - 対象ファイル: 新規 `components/SectionHeader.tsx`、各 `app/*/page.tsx`
- [ ] **P0-6. フッター（指標の定義・注意書き）**
  - 対象ファイル: 新規 `components/SiteFooter.tsx`、`components/AppShell.tsx`

### P1: 競合と同等の機能を揃える
- [ ] **P1-1. トップページにヒーロー＋「いま注目のVTuber」カード**
  - 対象ファイル: `app/page.tsx`, `components/GrowthTop3.tsx`
- [ ] **P1-2. ランキングに「伸び率」タブと「登録者規模フィルター」**
  - 対象ファイル: `lib/ranking.ts`, `components/RankingTabs.tsx`, `types/index.ts`
- [ ] **P1-3. ランキング行のリッチ化（TOP3 表彰台＋行デザイン）**
  - 対象ファイル: `components/RankingTabs.tsx`
- [ ] **P1-4. ヘッダーの VTuber 検索**
  - 対象ファイル: 新規 `components/SearchBox.tsx`、`components/AppShell.tsx`
- [ ] **P1-5. VTuber 詳細ページの強化**
  - 対象ファイル: `components/VTuberTabs.tsx`, `app/vtuber/[channelId]/page.tsx`, `app/api/vtuber/[channelId]/route.ts`
- [ ] **P1-6. 事務所（グループ）一覧・詳細ページ**
  - 対象ファイル: 新規 `app/office/page.tsx`, `app/office/[slug]/page.tsx`、`lib/offices.ts`, `app/sitemap.ts`

### P2: 差別化（競合に無い体験）
- [ ] **P2-1. 順位変動（前週比 ▲3 / ▼2 / NEW）**
  - 対象ファイル: `lib/ranking.ts`, `types/index.ts`, `components/RankingTabs.tsx`
- [ ] **P2-2. ランキングの OGP 画像（SNS シェア用）**
  - 対象ファイル: 新規 `app/ranking/opengraph-image.tsx`, `app/vtuber/[channelId]/opengraph-image.tsx`
- [ ] **P2-3. 配信カードの強化（データと配信を繋ぐ）**
  - 対象ファイル: `components/VideoCard.tsx`, `components/StreamTabs.tsx`
- [ ] **P2-4. テーマ切替とデザイントークン整理**
  - 対象ファイル: `app/globals.css`, `app/layout.tsx`, `components/SettingsList.tsx`
- [ ] **P2-5. 誕生日・記念日カレンダー（要バックエンド確認）**
  - 対象ファイル: `app/events/page.tsx`, `components/EventCalendar.tsx`, `backend-repo/functions/`

---

## 📌 Copilot への共通実装指示プロンプトテンプレート

```text
あなたは Next.js (App Router) + TypeScript + Tailwind CSS v4 のフロントエンドエンジニアです。
リポジトリ直下の COPILOT_TASK.md の「UI改善バックログ」から、タスク【P0-1】を実装してください。
必ず「共通デザインルール」と該当タスクの「仕様」「完了条件」を読んでから着手すること。

## 制約
- 追加してよい npm パッケージは lucide-react のみ。グラフは自前SVG。
- any は使わない。既存の型・ヘルパー（toNumber, toArray, GcsFetchError, useSelectedChannels, smallAvatar, safeHttpUrl）を再利用する。
- Server Component で済むものはクライアント化しない。localStorage 依存の処理はクライアント側のみで行う。
- スマホ幅（375px）で横スクロールが発生しないこと。ダークモードでも崩れないこと。
- タスクの範囲外のファイルの見た目・挙動を変えない。

## 完了条件（必ず自分で実行して確認）
- npx tsc --noEmit がエラーなし
- npm run build が成功
- npm run dev で該当ページを 375px / 1280px の両方で目視確認し、タスクの「完了条件」を満たす
- 完了したら COPILOT_TASK.md の該当タスク見出しに ✅ を付ける