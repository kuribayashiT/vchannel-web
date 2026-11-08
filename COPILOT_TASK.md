# COPILOT_TASK: ランキングへの「登録者 急上昇」タブ追加および UI 改善バックログ

> 最終更新: 2026-11-08 / 担当: プロダクトデザイナー → 実装: GitHub Copilot

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
- [ ] **P1-7. ランキングの表示状態を URL クエリと同期（共有・ブラウザ戻る/進む・ブックマーク対応）**
  - **対象ファイル**:
    `lib/rankingQuery.ts`（新規）
    `components/RankingTabs.tsx`
    `app/ranking/page.tsx`
  - **仕様**:
    - **背景**: 現状、ランキングのタブ（週間同時視聴者数 / YouTube登録者数 / 動画本数 / 登録者急上昇）や期間（週間/月間）は React の state だけで保持している。そのため URL を SNS や Discord で共有しても常に初期タブで開く。リロードやブラウザの戻る操作でも選択状態が失われる。「このランキング見て！」と URL 単位で共有・流入できるようにし、ファン間の拡散と検索流入の導線を作る。
    - `lib/rankingQuery.ts` に、クエリ文字列と状態を相互変換する純関数を新規作成する。
      - `parseRankingQuery(searchParams): RankingViewState`
      - `buildRankingQuery(state): string`
      - 対応パラメータ:
        - `tab` = `live` | `subscribers` | `videos` | `growth`
        - `period` = `week` | `month`（`growth` タブのみ有効）
      - 不正値・未指定は既定値（現行の初期タブ）にフォールバックする。`any` は使わず、`as const` のユニオン型で定義する。
      - 既定値と同じ値はクエリに含めない（URL を `/ranking` のままきれいに保つ）。
    - `components/RankingTabs.tsx`:
      - タブ・期間切替時に `router.replace(`${pathname}?${query}`, { scroll: false })` で URL を更新する。履歴を汚さないため `push` ではなく `replace` を使う。ただしタブ切替のみ `push` とし、戻る操作でタブが戻るようにしてもよい（どちらかに統一し、`FRONTEND_SPEC.md` に明記すること）。
      - 初期 state は URL から復元する。ブラウザの戻る/進むで `searchParams` が変わった場合も表示が追従すること。
      - 選択事務所フィルター（localStorage）は URL に含めない。URL を開いた人には全体ランキングを見せ、共有 URL が個人設定に左右されないようにする。
      - `useSearchParams` を使うため、`app/ranking/page.tsx` 側で `RankingTabs` を `<Suspense fallback={...}>` で囲む。`npm run build` の CSR bailout エラーを防ぐこと。
    - `app/ranking/page.tsx`:
      - `generateMetadata` で `tab` / `period` に応じたタイトルと description を返す。例: `登録者急上昇ランキング（月間）| Vちゃんねる`。
      - `canonical` はタブごとの URL（`/ranking?tab=growth&period=month`）にする。
    - アクセシビリティ: タブは `role="tablist"` / `role="tab"` / `aria-selected` を付与する。
    - 範囲外: OGP 画像生成（P2-2）、順位変動（P2-1）は本タスクでは扱わない。
    - 追加パッケージは不要。`FRONTEND_SPEC.md` の「ランキング」節に、対応クエリ一覧と履歴の方針を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。
    - `npm run build` が成功する（`useSearchParams` 関連の Suspense 警告・エラーが出ない）。
    - `/ranking?tab=growth&period=month` を直接開くと「登録者急上昇」タブ・「月間」が選択された状態で表示される。
    - タブや期間を切り替えると URL が更新される。リロードしても同じ状態が復元される。ブラウザの戻る/進むで表示が追従する。
    - `?tab=xxx` のような不正値でもエラーにならず、既定タブで表示される。
    - 375px / 1280px の両方で見た目が崩れず、横スクロールが発生しない。ダークモードでも崩れない。
    - `FRONTEND_SPEC.md` が更新されている。
- [ ] **P1-8. 「推しVTuber」登録（★ボタン）とマイページ「推しダッシュボード」**
  - **対象ファイル**:
    `lib/oshi.ts`（新規）
    `components/OshiButton.tsx`（新規）
    `components/OshiDashboard.tsx`（新規）
    `app/oshi/page.tsx`（新規）
    `components/RankingTabs.tsx`
    `components/VTuberTabs.tsx`
    `components/GrowthTop3.tsx`
    `components/BottomNav.tsx` または `components/AppShell.tsx`（導線追加）
    `FRONTEND_SPEC.md`
  - **仕様**:
    - **背景**: 競合 data.vmato.jp は「全体の数値を眺める」統計サイトであり、ユーザー個人に最適化された体験は持たない。Vちゃんねるは配信予定・ニュース・ランキング・誕生日データを一か所に持つ強みがある。「自分の推しだけの情報がまとめて見える」画面を作り、リピート率（毎日開く理由）とブックマーク率を高める。認証なし・localStorage のみで完結させ、サーバーコストは増やさない。既存の「選択事務所フィルター（`favoriteOffices`）」は事務所単位、「お気に入り（`favorites`）」は動画単位であり、本タスクは **VTuber（チャンネル）単位**の新概念として区別する。
    - `lib/oshi.ts`（クライアント専用の薄いストア）:
      - localStorage キー `oshiChannels`（`string[]`＝YouTube チャンネル ID）。最大 30 件、超過時は追加を拒否してトースト／メッセージで通知する。
      - `useOshi(): { oshiIds: string[]; isOshi(id): boolean; toggleOshi(id): void; clearOshi(): void }` を `useSyncExternalStore` で実装する。SSR 時は空配列（hydration mismatch を起こさない）。`storage` イベントで他タブとも同期する。
      - JSON.parse 失敗や不正値は空配列にフォールバックし、例外を投げない。`any` は使わず、既存ヘルパー（`toArray` 等）を再利用する。
    - `components/OshiButton.tsx`:
      - lucide-react の `Star`（登録済みは塗りつぶし）を使うアイコンボタン。`aria-pressed`、`aria-label`（`推しに登録` / `推しから外す`）を付与し、タップ領域は 44px 以上。
      - クリックが親要素のリンク（詳細ページ遷移など）に伝播しないよう `preventDefault` / `stopPropagation` する。
    - ★ボタンの設置箇所: ランキング行（`RankingTabs`）、急上昇 TOP3（`GrowthTop3`）、VTuber 詳細（`VTuberTabs`）。既存レイアウトを崩さない位置に置く。
    - `app/oshi/page.tsx` + `components/OshiDashboard.tsx`（`/oshi`、`"use client"` は Dashboard 側のみ）:
      - データは既存の GCS 取得ヘルパーで `officedataList.json` / `livevideoList.json` / ランキング用データを取得する（新規 API・RTDB 読み取りは作らない）。推し ID で絞り込み、以下のセクションを表示する。
        1. **配信中・今日の配信予定**: `comparisonDay` を JST の暦日で判定。配信中は同時視聴者数付き。0 件は `推しの配信予定はありません`。
        2. **登録者の動き（直近 7 日）**: `youtubeSubscriberCountTransition` から増加数・増加率を算出し、ミニ推移グラフ（既存の自前 SVG を再利用）で表示。データ不足時は `データなし`。
        3. **もうすぐ誕生日／周年**: `birthday` / `debut` から 30 日以内に迫るものを日数順で表示（`あと N 日` / `今日`）。形式が不正なものは無視する。
        4. **推し一覧**: サムネ・名前・事務所・VTuber 詳細へのリンク・★解除ボタン。
      - 推し 0 件の空状態: `まだ推しが登録されていません` ＋ 説明文 ＋ `ランキングを見る` ボタン（`/ranking` へ）。
      - 「推しを全て解除」は確認ダイアログ（`推しを全て解除しますか？` / `はい` / `いいえ`）を経由する。
      - 画面のどこかに `推しの登録情報はこの端末のブラウザにのみ保存されます` と明記する。
      - ローディング中は P0-4 のスケルトンがあれば再利用、無ければ `読み込み中…` を表示する。取得失敗時は `GcsFetchError` を捕捉して `データの取得に失敗しました` と `再読み込み` を表示する。
    - 導線: BottomNav／ヘッダーに `推し`（lucide `Star` アイコン）を追加する。BottomNav が 5 項目を超えて窮屈になる場合は、ヘッダー右上のアイコンリンクとして追加する。
    - SEO: `/oshi` は個人データのため `metadata.robots = { index: false }` とし、`app/sitemap.ts` には含めない。
    - 範囲外: ログイン・クラウド同期、プッシュ通知、推しの共有 URL 生成、P2-1（順位変動）。
    - 追加パッケージは不要（lucide-react は導入済み前提。未導入なら P0-1 を先に完了させる）。`FRONTEND_SPEC.md` に、`oshiChannels` キー（localStorage 一覧表への追記）、`useOshi`、`OshiButton`、`/oshi` 画面仕様を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。
    - `npm run build` が成功し、hydration エラー／警告がコンソールに出ない。
    - ランキング行・TOP3・VTuber 詳細で ★ をタップすると登録/解除が切り替わり、リロード後も維持される。別タブで操作しても反映される。
    - ★ をタップしても行リンクへ遷移しない。
    - `/oshi` に推しの配信中/予定・登録者の動き・誕生日/周年・推し一覧が表示される。0 件時は空状態が表示される。
    - 31 件目の登録は拒否され、メッセージが表示される。localStorage に不正な値が入っていてもクラッシュしない。
    - 375px / 1280px の両方で見た目が崩れず、横スクロールが発生しない。ダークモードでも崩れない。
    - `FRONTEND_SPEC.md` が更新されている。

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

text
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