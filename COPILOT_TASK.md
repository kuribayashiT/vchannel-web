# COPILOT_TASK: ランキングへの「登録者 急上昇」タブ追加および UI 改善バックログ

> 最終更新: 2026-11-12 / 担当: プロダクトデザイナー → 実装: GitHub Copilot

---

## 完了したタスク (Done)

- [x] **ランキングに「登録者 急上昇（増加数）」タブを追加する** (2026-11-03 完了)
  - 期間切替（週間/月間）、増加数・増加率・ミニ推移グラフ、GCSからのデータ取得・集計ロジックの実装。

---

## ⏳ 未完了タスク (To Do) - UI改善バックログ（data.vmato.jp 比較）

上から順に着手すること（P0 → P1 → P2）。1タスク = 1PR を目安とし、実装完了時は `[ ]` を `[x]`（または ✅）に更新すること。

### P0-CHAT: 掲示板の動作改善（最優先・下記 P0 より先に着手）

> **前提（人手作業）**: ✅ 2026-11-08 作成済み。Firebase Console で複合インデックス `posts`: `threadId` 昇順 + `postNo` **降順**（ID: `CICAgJim14AK`、2 タスク共通）を作成。既存の `threadId` + `createdAt` インデックスは Flutter アプリが使用中のため削除しないこと。
> ⚠ `backend-repo/firestore.rules` / `firestore.indexes.json` は本番と不一致（期限切れルール）のため、**`firebase deploy --only firestore` は絶対に実行しない**こと。本番ルールは Console 側が正。

- [x] **CHAT-1. 投稿一覧の差分取得・ページング（全件取得＋15秒ごとの全件ポーリングを廃止）**
  - **対象ファイル**: `lib/firestore.ts`, `app/api/chat/posts/route.ts`, `components/ChatBoard.tsx`, `lib/chat.ts`
  - **背景**:
    - 現状の `listPosts` は `orderBy` なしで `limit: 1000` を取得し、取得後に並べ替えている。1000 件を超えたスレッドでは**どの 1000 件が返るか不定で、最新レスが欠落**する。
    - `ThreadView` は 15 秒ごとにスレッドの全件を再取得している。閲覧者 1 人あたり「レス数 × 4 回/分」の Firestore 読み取りが発生し、課金面でも非効率。
  - **仕様**:
    - `lib/firestore.ts`
      - `listPosts(threadId, opts: { before?: number; after?: number; limit?: number })` に変更する。
      - クエリは `where threadId == X` + `orderBy postNo DESC` + `limit`（既定 50、最大 100）。
        - `before` 指定時は `postNo < before` を追加する。
        - `after` 指定時は `postNo > after` を追加する。
      - 戻り値は**昇順に反転**して返す（UI 側は従来どおり古い順に表示）。
      - 昇順のインデックスは作らない。前提の降順インデックス 1 本で両方向を賄う。
    - `app/api/chat/posts/route.ts` の GET
      - クエリ `before` / `after` / `limit` を受け付ける。
      - いずれも正の整数のみ許可し、不正値は 400 を返す。
      - `before` と `after` の同時指定も 400 を返す。
      - レスポンスは `{ posts: ChatPost[]; hasMore: boolean }` とする。`hasMore` は `before` 方向にまだ古いレスがあるか（取得件数 == limit で判定）。
    - `components/ChatBoard.tsx`（`ThreadView`）
      - 初回は最新 50 件を取得する。
      - リストの先頭に「以前のレスを読み込む」ボタンを置く（`hasMore` が true の間だけ表示）。押したら `before = 表示中の最小 postNo` で取得し、先頭に追加する。
      - ポーリングは `after = 表示中の最大 postNo` で**新着分だけ**を取得し、末尾に追加する。`id` で重複を除外する。
      - タブが非表示（`document.visibilityState === "hidden"`）の間はポーリングを止める。復帰時に即座に 1 回取得する。
      - 投稿成功時（`onPosted`）も新着の差分取得を呼ぶ。
      - スレッド切り替え時は state を初期化する。
    - `any` は使わない。新規の追加パッケージは不要。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - 50 件超のスレッドで最新 50 件が表示され、「以前のレスを読み込む」で過去分を遡れる。
    - 新規投稿・他者の投稿が 15 秒以内に末尾へ追加され、重複表示されない。
    - `?after=abc` や `?before=1&after=2` は 400 を返す。
    - `FRONTEND_SPEC.md` の 2.2 / 5.6 節に、API パラメータとポーリング方針を追記する。

- [ ] **CHAT-2. Web 投稿の postNo 採番を「件数+1」から「最大 postNo+1（楽観ロック付き）」に変更**
  - **対象ファイル**: `lib/firestore.ts`, `app/api/chat/posts/route.ts`
  - **背景**:
    - 現状は `countPosts()+1` で採番している。同時投稿で**同じレス番号が重複**し、`>>N` アンカーが壊れる。
    - スレッドの `postCount` は採番に使えない。Flutter アプリが `postCount` を増やしておらず（ルールで thread 更新が拒否されている）、実際のレス数より小さくなっているため。
  - **仕様**:
    - `addPost` を次の手順に変更する。
      1. `threads/{threadId}` を GET し、`updateTime` を控える。
      2. `posts where threadId == X orderBy postNo DESC limit 1` で最大 postNo を取得し、`postNo = max + 1`（0 件なら 1）とする（CHAT-1 と同じインデックスを使う）。
      3. 既存どおり `:commit` で「post の作成」と「thread の `lastUpdated` / `postCount` +1」を書き込む。その際、thread 側の write の `currentDocument` を `{ updateTime: 手順1の値 }` に変更する。
    - 手順 3 の結果ごとの扱い:
      - **`FAILED_PRECONDITION`（HTTP 400）**: 他の投稿が先にコミットされたと判断する。手順 1 からやり直し、最大 3 回までリトライする。
      - **3 回とも失敗した場合**: 409 を返す。UI には「混み合っています。もう一度お試しください」と表示する。
      - **それ以外のエラー**: 従来どおり 502 を返す。
      - 上記を判別するため、`call()` はステータスコードを持つ Error を投げるようにする。
    - Firestore ルール（Console 側で確認済み）とは両立する。thread は `lastUpdated` = REQUEST_TIME と `postCount` +1 のみの更新、post は既存フィールドのみで、新しいフィールドは追加しない。
    - `countPosts()` は不要になるので削除する。
    - **残存リスク（仕様として許容）**: Flutter アプリからの投稿は thread を更新しないため、楽観ロックでは検知できない。Web と Flutter が同時に投稿した場合の重複は残る。根本対策は Flutter 側の修正と、posts ルールへの `postNo == getAfter(thread).postCount` の追加で、別タスクとする。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - Web から投稿すると、スレッド内の最大 postNo + 1 で採番される。
    - 2 つのタブからほぼ同時に投稿しても、Web 同士では postNo が重複しない。
    - `FRONTEND_SPEC.md` 2.2 節の「書き込み」の記述を更新する。

### P0: 見た目の底上げ（低コスト・効果大）
- [x] **P0-1. 絵文字アイコンを SVG アイコンに置き換え、BottomNav にアイコンを付ける**
  - 対象ファイル: `components/AppShell.tsx`, `components/BottomNav.tsx`, `package.json`
- [x] **P0-2. 数値の短縮表記ユーティリティ**
  - 対象ファイル: 新規 `lib/format.ts`、`components/RankingTabs.tsx`, `components/GrowthTop3.tsx`, `components/VTuberTabs.tsx`, `components/VideoCard.tsx`
- [x] **P0-3. 画像のフォールバック（壊れ画像アイコンを根絶）**
  - 対象ファイル: 新規 `components/SafeImage.tsx`、`app/news/page.tsx`, `components/VideoCard.tsx`, `components/RankingTabs.tsx`, `components/GrowthTop3.tsx`, `components/VTuberTabs.tsx`
- [x] **P0-4. スケルトンローディング**
  - 対象ファイル: 新規 `components/Skeleton.tsx`、新規 `app/loading.tsx`, `app/ranking/loading.tsx`, `app/news/loading.tsx`, `components/StreamTabs.tsx`, `components/VTuberTabs.tsx`, `app/vtuber/[channelId]/page.tsx`
- [x] **P0-5. セクション見出しコンポーネント**
  - 対象ファイル: 新規 `components/SectionHeader.tsx`、各 `app/*/page.tsx`
- **P0-6. フッター（指標の定義・注意書き）**: 共通表示は不要のため中止。

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
- [ ] **P1-9. 配信タブの自動更新（ライブ・ポーリング）と「最終更新 N分前」表示**
  - **対象ファイル**:
    `lib/useLivePolling.ts`（新規）
    `components/LiveRefreshBar.tsx`（新規）
    `app/api/streams/route.ts`（新規）
    `components/StreamTabs.tsx`
    `app/page.tsx`（配信タブを表示しているページ。初期データ受け渡しの調整のみ）
    `FRONTEND_SPEC.md`
  - **仕様**:
    - **背景**: data.vmato.jp は登録者・再生数などの「統計」が中心で、数時間〜日単位の更新が前提。一方 Vちゃんねるは `livevideoList.json` が約 5 分周期で更新される「いま配信中」のリアルタイム性という、競合にない強みを持つ。ところが現状の配信タブは ISR で取得した初期表示のまま固定で、開きっぱなしにしても「配信中」「同時視聴者数」「配信終了」が更新されず、ユーザーは手動リロードが必要になっている。ページを開いたままでも配信状況が自動で追従し、「どれくらい新しい情報か」が分かる状態にして、滞在時間とリピート率を高める。サーバーコストは Route Handler の CDN キャッシュで抑える。
    - `app/api/streams/route.ts`（新規 Route Handler、GET のみ）:
      - 既存の GCS 取得ヘルパーで `livevideoList.json` のみを取得して返す（RTDB の読み取り・Firestore・新規外部 API は使わない）。
      - 数値文字列（`concurrent_viewers` 等）の正規化、`videoID` / `videoId` のキー揺れ吸収は、既存ヘルパー（`toNumber` など）を再利用して配信タブ側と同じ結果になるようにする。重複実装しない。
      - レスポンスヘッダー: `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`。レスポンスに `fetchedAt`（ISO8601 UTC）を含める。
      - 取得失敗時は `GcsFetchError` を捕捉し、ステータス 502 と `{ error: "fetch_failed" }` を返す。内部のエラー詳細・URL はクライアントに漏らさない。
    - `lib/useLivePolling.ts`（クライアント専用フック）:
      - `useLivePolling<T>(options: { initialData: T; initialFetchedAt: string; enabled: boolean; intervalMs?: number }): { data: T; fetchedAt: Date; isRefreshing: boolean; isError: boolean; refresh: () => Promise<void> }`
      - 既定の間隔は 60 秒。`enabled` が `true`（＝「配信中」または「今日の配信」タブ表示中）、かつ `document.visibilityState === "visible"` の間のみポーリングする。それ以外のタブ・バックグラウンドでは停止する。
      - タブが再び visible になった時、または `online` イベント発火時、最終取得から 60 秒以上経過していれば即時に再取得する。
      - 失敗時は前回データを保持したまま `isError = true` とし、指数バックオフ（60 → 120 → 240 秒、上限 5 分）で再試行する。成功したらリセットする。
      - アンマウント時に `AbortController` と `setTimeout` / イベントリスナーを確実に破棄し、競合したレスポンス（古いリクエストの後着）で新しいデータを上書きしないこと。
      - `any` は使わず、レスポンス型は `types/index.ts` の既存 Video 型を再利用する。追加パッケージ（SWR 等）は導入しない。
    - `components/LiveRefreshBar.tsx`（新規。クライアントコンポーネント）:
      - 配信タブ上部に `最終更新 N分前`（1 分未満は `たった今`）と、lucide-react の `RefreshCw` アイコンによる手動更新ボタン（`aria-label="配信情報を更新"`、タップ領域 44px 以上）を表示する。
      - 相対時間は 30 秒ごとに再計算する。更新中は `RefreshCw` を回転させる（`prefers-reduced-motion` の場合は回転させず、`更新中…` のテキスト表示にする）。
      - 失敗時は `更新に失敗しました。前回のデータを表示中` を `AlertTriangle` アイコン付きで表示する（再試行は自動、ボタンでも可能）。
      - ステータス文言は `aria-live="polite"` の領域に置く。ただし 60 秒ごとの成功更新は読み上げない（成功時は文言を変えず、失敗時のみ通知する）。
    - `components/StreamTabs.tsx`:
      - 初期データはサーバー（ISR）から受け取った値を `initialData` として使い、初回表示は現状と同じ速さを維持する。
      - バックグラウンド更新中はスケルトン（P0-4）や全体スピナーを出さない。リストのちらつき・スクロール位置のジャンプ・レイアウトシフトを起こさないよう、`videoID` をキーにして差分更新する。
      - 「配信中」タブのラベルに件数バッジ `配信中 (N)` を表示する（0 件ならバッジなし）。件数は選択事務所フィルター適用後の値とする。
      - 更新で配信が終了した動画は「配信中」から自然に消え、「過去アーカイブ」側へ振り分けられる（既存の `comparisonDay` / `actualEndTime` 判定ロジックを再利用し、判定を二重実装しない）。
      - 「過去アーカイブ」「明日」「明日以降」タブではポーリングを行わない（`enabled = false`）。
    - 範囲外: WebSocket / SSE、プッシュ通知、YouTube API の直接利用、ニュース・ランキングの自動更新、広告。
    - `FRONTEND_SPEC.md` の「配信タブ」節に、更新間隔・停止条件（非表示/対象外タブ）・バックオフ・`/api/streams` の仕様（キャッシュヘッダー含む）・`LiveRefreshBar` / `useLivePolling` を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。
    - `npm run build` が成功し、hydration エラー／警告がコンソールに出ない。
    - `/api/streams` が 200 で JSON（`fetchedAt` を含む）を返し、レスポンスヘッダーに `s-maxage=60` が含まれる。GCS 取得失敗を擬似的に起こすと 502 が返り、内部情報が漏れない。
    - 「配信中」タブを開いたまま約 60 秒待つと、Network タブで `/api/streams` が定期的に呼ばれ、リストと「最終更新」表示が更新される。
    - 別ブラウザタブへ切り替えている間はリクエストが発生せず、戻ると（60 秒以上経過していれば）即座に再取得される。「過去アーカイブ」タブ表示中は発生しない。
    - 手動更新ボタンで即時更新され、更新中は回転（または `更新中…`）が表示される。オフラインにすると失敗表示になり、復帰後に自動で回復する。
    - 更新中にスケルトンやちらつきが出ず、スクロール位置が維持される。ページ遷移直後にアンマウントしてもコンソールにエラー／警告（unmounted の state 更新など）が出ない。
    - 375px / 1280px の両方で見た目が崩れず、横スクロールが発生しない。ダークモードでも崩れない。
    - `FRONTEND_SPEC.md` が更新されている。
- [ ] **P1-10. ニュースに「媒体フィルター」「キーワード検索」「日付見出しグルーピング」を追加**
  - **対象ファイル**:
    `lib/newsFilter.ts`（新規）
    `components/NewsFilterBar.tsx`（新規）
    `components/NewsList.tsx`（新規。ニュース一覧を描画している既存コンポーネントがある場合はそれを改修して統合する）
    `app/news/page.tsx`（Server Component のまま取得処理を維持し、一覧描画をクライアント側コンポーネントへ委譲するための調整のみ）
    `FRONTEND_SPEC.md`
  - **仕様**:
    - **背景**: ランキング・配信・VTuber 詳細は P1 で強化が進んでいるが、ニュースは「`news.json` の順に縦に並べるだけ」で、検索・絞り込み・日付の区切りが一切ない。件数が増えると「推しの最新ニュースだけ読みたい」「特定の媒体だけ見たい」というニーズに応えられず、ファンの回遊が止まる。競合 data.vmato.jp は統計中心でニュース閲覧体験を持たないため、Vちゃんねる独自の強み（配信・ニュース・数値を一か所で）をニュース面で伸ばす。サーバー処理・新規 API は増やさず、取得済みデータをクライアント側で絞り込むだけで完結させる。
    - `lib/newsFilter.ts`（副作用のない純関数のみ。`any` 禁止、型は `types/index.ts` の既存 News 型を再利用）:
      - `getNewsChannelLabel(item): string` — `channel` が空または `YouTube` 等の場合は `ブログ記事` を返す（現行カードの表示ルールと同一にし、カード側もこの関数を使って二重実装を避ける）。
      - `listNewsChannels(items): { label: string; count: number }[]` — 媒体ごとの件数を集計し、件数の降順で返す。
      - `normalizeKeyword(text): string` — `normalize("NFKC")` ＋ 小文字化 ＋ 前後空白除去（全角/半角・大文字/小文字の揺れを吸収）。
      - `filterNews(items, { channel: string | null; keyword: string }): News[]` — `channel` は媒体ラベルの完全一致。`keyword` は `title` / `description` / 媒体ラベルを対象に、スペース区切りの AND 部分一致。元の並び順は維持する（再ソートしない）。
      - `groupNewsByDate(items, now?: Date): { key: string; label: string; items: News[] }[]` — `publishedAt`（`YYYY-MM-DD HH:mm:ss`）の暦日でグルーピング。ラベルは `今日` / `昨日` / `M月d日(曜)`（JST 基準）。パース不能な日付は末尾に `日付不明` グループとしてまとめ、例外を投げない。グループ順は新しい日付順、グループ内は元の順序を維持。
      - `publishedAt` はタイムゾーン情報を持たない。生成元（`backend-repo/functions/` 内のニュース収集処理）を確認し、JST かどうかを `FRONTEND_SPEC.md` に明記したうえで、その前提で JST 暦日に変換する。
    - `components/NewsFilterBar.tsx`（クライアントコンポーネント）:
      - 検索ボックス: lucide-react の `Search` アイコン、`placeholder="ニュースを検索（タイトル・本文）"`、入力中のみ `X` のクリアボタン（`aria-label="検索語を消去"`、タップ領域 44px 以上）。入力は 200ms デバウンスし、IME 変換中（`compositionstart`〜`compositionend`）は絞り込みを走らせない。
      - 媒体チップ: 横スクロールのチップ列（先頭は `すべて (N)`、以降は `媒体名 (件数)`）。選択中は `aria-pressed="true"` かつ配色で明示。スクロールバーは非表示にしてよいが、ページ全体の横スクロールは発生させない。
      - 結果件数表示 `N件`（`aria-live="polite"`）。絞り込み条件が有効なときのみ `条件をクリア` リンクを表示する。
      - 条件に一致する記事が 0 件のとき: `条件に一致するニュースがありません` ＋ `条件をクリア` ボタンを表示する。
    - `components/NewsList.tsx`:
      - 日付グループごとに見出し（`今日` など。P0-5 の `SectionHeader` があれば再利用、無ければ簡易な見出し）を表示し、その下にカードを並べる。見出しは `sticky`（ヘッダー直下）にしてもよいが、ヘッダーと重ならないこと。
      - 既存のカード表示（媒体名・タイトル・公開日・サムネ・`videoUrl` の動画導線・外部リンクの `target="_blank"` / `rel="noopener noreferrer"`）は変更しない。画像は P0-3 の `SafeImage` があれば再利用する。
      - 状態（検索語・選択媒体）は React の state のみで保持する。選択事務所フィルター（localStorage）の影響は受けない（`news.json` は事務所情報を持たないため）。
      - 絞り込み条件の変更でスクロール位置が不自然にジャンプしないこと（条件変更時はリスト先頭へ戻してよい）。
    - `app/news/page.tsx`: データ取得・ISR・エラー表示（`ニュースデータの取得に失敗しました（空データ）` ＋ `再読み込み`）の既存挙動は維持する。取得した配列を `NewsList` に渡すだけの最小変更とする。
    - 範囲外: URL クエリ同期（P1-7 と同様の仕組みは別タスクで検討）、全文検索 API、記事の要約・翻訳、既読管理、お気に入り記事、ニュースの自動更新、広告。
    - 追加パッケージは不要。`FRONTEND_SPEC.md` の「ニュース」節（5.3）に、`lib/newsFilter.ts` の各関数、フィルターバー／日付見出しの UI ルール、`publishedAt` のタイムゾーン前提、「検索・カテゴリ絞り込みなし」の記述の更新を反映する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。
    - `npm run build` が成功し、hydration エラー／警告がコンソールに出ない。
    - 検索語を入力すると 200ms 程度で一覧が絞り込まれ、全角・半角や大文字・小文字の違いを無視してヒットする。スペース区切りの複数語は AND 条件になる。IME 変換中は絞り込みが走らない。
    - 媒体チップで絞り込め、`すべて` で解除できる。検索語と媒体は併用でき、件数表示が正しい。
    - 一覧が日付見出し（`今日` / `昨日` / `M月d日(曜)`）で区切られ、日付が不正な記事があってもクラッシュせず `日付不明` に入る。
    - 0 件時に空状態メッセージと `条件をクリア` が表示され、押すと全件表示に戻る。
    - 既存のカード表示・外部リンク動作・ニュース取得失敗時の表示が変わっていない。
    - 375px / 1280px の両方で見た目が崩れず、ページ全体の横スクロールが発生しない（チップ列のみ内部スクロール可）。ダークモードでも崩れない。
    - `FRONTEND_SPEC.md` が更新されている。
- [ ] **P1-11. 「今日の配信」「明日の配信」に時間帯ジャンプナビと「いま」インジケータを追加**
  - **対象ファイル**:
    `lib/streamTimeline.ts`（新規。時間帯グルーピングが `StreamTabs.tsx` 内にインライン実装されている場合は、ここへ抽出して共通化する）
    `components/HourJumpNav.tsx`（新規）
    `components/StreamTabs.tsx`
    `FRONTEND_SPEC.md`
  - **仕様**:
    - **背景**: 「今日の配信」「明日の配信」は 0〜23 時の時間帯別グルーピングで表示されるが、1 日の配信数は数十〜100 件超になり、縦に非常に長い。「今夜 21 時の配信を見たい」「いま何が始まるのか知りたい」というファンの最頻ニーズに対し、現状は延々とスクロールするしかなく、直帰・離脱の原因になる。競合 data.vmato.jp は統計中心で配信スケジュールの閲覧体験が弱いため、タイムテーブルの使いやすさで明確に差別化する。サーバー処理・新規 API・追加パッケージは不要で、取得済みデータの表示改善のみで完結させる。
    - `lib/streamTimeline.ts`（副作用のない純関数のみ。`any` 禁止、型は `types/index.ts` の既存 Video 型を再利用）:
      - `getJstHour(comparisonDay: string): number | null` — ISO8601(UTC) を `Asia/Tokyo` の時（0〜23）に変換する。パース不能なら `null`（例外を投げない）。ブラウザのタイムゾーンに依存しないこと（`Intl.DateTimeFormat` の `timeZone: "Asia/Tokyo"` を使うか、UTC+9 を加算して算出する）。
      - `groupVideosByHour(videos): { hour: number; items: Video[] }[]` — 時の昇順。動画が 0 件の時間帯は含めない。`null` の動画は既存の挙動に合わせる（既存で除外していれば除外、末尾にまとめていればそれを踏襲する）。グループ内の並びは既存ロジックを踏襲し、判定を二重実装しない。
      - `findCurrentHourAnchor(groups, now?: Date): number | null` — 「いま」にもっとも近いジャンプ先の時を返す。現在の JST の時のグループがあればその時、無ければ現在以降で最初のグループ、それも無ければ `null`。
    - `components/HourJumpNav.tsx`（クライアントコンポーネント）:
      - 配信がある時間帯のみを `0時` 〜 `23時` のチップとして横スクロールで並べる。各チップは件数を併記する（例: `21時 (12)`）。
      - 先頭に `いま` チップ（lucide-react の `Clock` アイコン付き）を置く。「今日の配信」タブのみ表示し、`findCurrentHourAnchor` の結果へジャンプする。`null` のときは非表示にする。「明日の配信」タブでは表示しない。
      - チップ押下で対応する時間帯見出しへスムーズスクロールする（`scrollIntoView`、`prefers-reduced-motion` の場合は `behavior: "auto"`）。見出し側に `id="hour-{tab}-{hour}"` と、ヘッダー＋本ナビの高さ分の `scroll-margin-top` を付与し、見出しがナビやヘッダーに隠れないこと。
      - ナビ自体はヘッダー直下に `sticky` で固定する。ヘッダーと重ならず、背景は不透明（または blur 付き）でダークモードでも読めること。
      - スクロール位置に応じて現在表示中の時間帯のチップをハイライトする（`IntersectionObserver` を使用。`aria-current="true"` と配色で明示。アクティブなチップが画面外なら、チップ列を内部スクロールして見える位置へ追従させる）。ページ全体の横スクロールは発生させない。
      - アクセシビリティ: `<nav aria-label="時間帯ジャンプ">`、各チップは `button`（タップ領域 44px 以上）。
      - 時間帯グループが 3 つ未満のときは意味が薄いためナビ自体を表示しない。
    - `components/StreamTabs.tsx`:
      - 「今日の配信」「明日の配信」の描画時のみ `HourJumpNav` を挿入し、各時間帯見出しに `id` を付与する。他のタブ（過去アーカイブ・配信中・明日以降）の見た目・挙動は変えない。
      - 「今日の配信」では、現在の JST の時の見出しに `いま` バッジを付け、現在時刻より前の時間帯の見出しは文字色を薄くして「過去の時間帯」と分かるようにする。ただしカード本体は薄くせず、タップ操作は従来通り可能にする。バッジ・薄表示の判定は 1 分ごとに再計算する（`setInterval` はアンマウント時に必ず破棄