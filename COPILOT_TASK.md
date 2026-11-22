# COPILOT_TASK: ランキングへの「登録者 急上昇」タブ追加および UI 改善バックログ

> 最終更新: 2026-11-22 / 担当: プロダクトデザイナー → 実装: GitHub Copilot

---

## 完了したタスク (Done)

- [x] **ランキングに「登録者 急上昇（増加数）」タブを追加する** (2026-11-03 完了)
  - 期間切替（週間/月間）、増加数・増加率・ミニ推移グラフ、GCSからのデータ取得・集計ロジックの実装。

---

## ⏳ 未完了タスク (To Do) - UI改善バックログ（data.vmato.jp 比較）

**⚠ このファイルのタスク（完了済み・未完了とも）を削除・要約しないこと。** 完了したら該当行の `[ ]` を `[x]` にするだけにする。コードブロックの ``` も消さないこと（2026-11-12 の PR #17、2026-11-13 の PR #18 でファイル後半約 250 行と ``` が消えたため、PM が復元した。原因は `scripts/task-fallback.js` がファイル全体を書き直すこと）。

上から順に着手すること（P0 → P1 → P2）。1タスク = 1PR を目安とし、実装完了時は `[ ]` を `[x]`（または ✅）に更新すること。

### P0-GSC: Google Search Console 所有権確認（最優先・P0-AFF より先に着手）

- [x] **GSC-1. Google Search Console の確認用メタタグを追加**
  - **対象ファイル**: `app/layout.tsx`
  - **仕様**:
    - `metadata` の `icons` の直前に以下を追加する。値は秘密情報ではないため、環境変数にせず直書きでよい。
      ts
      verification: {
        google: "dlA9QuuEy2gQC1AuuiFp96bz0wPej2D3daAPKi3q890",
      },
      
    - 対象プロパティは URL プレフィックス `https://vchannel-web.vercel.app`。
    - 他の metadata は変更しない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - ビルド後の HTML の `<head>` に `<meta name="google-site-verification" content="dlA9QuuEy2gQC1AuuiFp96bz0wPej2D3daAPKi3q890"/>` が出力される。
    - `FRONTEND_SPEC.md` 1章「サイトアイコン」の下に「Search Console 確認タグ」の記述を追加している。
    - **Push 後、完了報告に「Vercel デプロイ完了後に Search Console で『確認』を押してください」と添える**（確認作業は人手）。

### P0-PERF: HTML 肥大化の解消（🚨緊急・P0-AFF より先に着手）

> **背景（2026-11-09 計測）**: Search Console の「公開 URL をテスト」「インデックス登録をリクエスト」が失敗した。本番 HTML のサイズを計測した結果は以下のとおり。
>
> | ページ | サイズ | 原因 |
> |---|---|---|
> | `/` | **15〜30MB** | `allvideos.json` の全件（約 2 万件）を `StreamTabs` の props で RSC ペイロードに埋め込んでいる |
> | `/ranking` | **6.7MB** | ランキング元データ（動画約 5,000 件を含む）を丸ごと `RankingTabs` に渡している |
>
> Googlebot が読み込むのは HTML の先頭 15MB までで、モバイル利用者の表示も極端に遅い。
> 目標: `/` と `/ranking` の HTML を **各 500KB 以下**にする。

- [x] **PERF-1. トップページの配信データをサーバー側で絞り込む**
  - **対象ファイル**:
    `app/page.tsx`
    `lib/stream.ts`
    `components/StreamTabs.tsx`
  - **仕様**:
    - `lib/stream.ts` に `trimStreamVideos(all: Video[], now = new Date()): Video[]` を追加する。サーバー側で以下だけを残す。
      - 今日・明日・それ以降: `comparisonDay` が **今日〜7日後（JST）** のもの全件
      - 過去アーカイブ: 新しい順に **最大 60 件**
    - `app/page.tsx` で `allVideos` をそのまま渡さず、`trimStreamVideos(allVideos)` の結果を渡す。
      - `liveVideos` は従来どおり全件渡す（件数が少ないため）。
      - `export const revalidate = 300` 相当のキャッシュは維持する。日付の境界をまたいでも、ISR の再生成で追従すればよい。
    - クライアントに渡す `Video` から、カード表示に使わないフィールドを削る（`toStreamCardVideo` などで必要なフィールドだけにした型を作る）。削る対象は、`StreamTabs` / `VideoCard` が参照していないことを確認したフィールド。
    - 選択事務所フィルター（クライアント側）の挙動は変えない。絞り込み後のリストに対してクライアントでさらにフィルタする。フィルタ後に過去アーカイブが少なくなるのは許容する。
    - `FRONTEND_SPEC.md` 5.2 に「サーバーで当日〜7日後＋過去 60 件に絞る」を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `curl -s <URL>/ -o top.html && wc -c top.html` が **500KB 以下**。
    - 配信中・今日・明日・以降・過去アーカイブの各タブが従来どおり表示される。

- [x] **PERF-2. ランキングページの props を表示に必要な分だけに絞る**
  - **対象ファイル**:
    `app/ranking/page.tsx`
    `lib/ranking.ts`
    `components/RankingTabs.tsx`
  - **仕様**:
    - サーバー側で各タブを **上位 100 件**に切り詰め、行の表示に必要なフィールドだけを持つ型（例: `RankingRow`）に変換してから `RankingTabs` に渡す。
      - 必要なフィールドの例: `channelId`、`name`、`office`、`thumbnail`、数値、週間同時視聴者タブの `videoId` / `title`
    - 選択事務所での絞り込みはクライアント側で行う。上位 100 件だけでは事務所絞り込み時の件数が不足する場合は、事務所ごとに上位 30 件を和集合で残す（`channelId` で重複を除く）。どちらを採用したかを `FRONTEND_SPEC.md` 5.5 に明記する。
    - 登録者急上昇タブ（growth）も同様に、上位 100 件と表示に必要なフィールドだけにする。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `curl -s <URL>/ranking -o rk.html && wc -c rk.html` が **500KB 以下**。
    - 全タブ・期間切替・事務所絞り込みが従来どおり動く。

### P0-SOFT404: 「ソフト 404」判定の解消（🚨緊急・P0-AFF より先に着手）

> **背景（2026-11-10 Search Console ライブテスト）**: `/vtuber` が「ページをインデックスに登録できません: ソフト 404」と判定された（`/ranking` は登録可）。
>
> 原因:
> - (1) 初期 HTML の本文が「Vtuberリストを読み込み中…」のみ（約 140 文字）で、一覧はクライアントから `/api/vtuber` を fetch して描画している。
> - (2) `robots.txt` が `Disallow: /api/` のため、Googlebot がレンダリング時に `/api/vtuber` を取得できず、空ページのまま評価される。
>
> 同じ状態のページ: `/events`（本文「読み込み中…」のみ）、`/vtuber/[channelId]`（SEO-1 で対応）。
>
> **方針**: Google に見せるべき本文は初期 HTML に含める（クライアント fetch に依存しない）。`robots.txt` の `/api/` 禁止は維持する。

- [x] **S404-1. `/vtuber` を初期データ付きでサーバーレンダリングする**（SEO-3 を前倒しして統合）
  - **対象ファイル**:
    `app/vtuber/page.tsx`
    `components/VTuberTabs.tsx`
    `components/VTuberDirectory.tsx`（新規・Server Component）
    `lib/server-data.ts`
  - **仕様**:
    - `app/vtuber/page.tsx` を async にし、`loadVTubers()` の `index` をサーバーで取得する。`export const revalidate = 3600`。
    - `VTuberTabs` に `initialIndex` props を追加し、渡された場合は `/api/vtuber` を fetch しない。
      - 選択中タブの詳細（`/api/vtuber/[id]`）は従来どおりクライアントで取得してよい。一覧は初期 HTML に出ること。
      - props で渡すのは `VTuberIndexItem`（軽量）のみ。HTML サイズが 500KB を超える場合は、`thumbnail` を除くなどで削減する。
    - SEO-3 の仕様どおり、タブ UI の下に「事務所別VTuber一覧」（`VTuberDirectory`）をサーバーレンダリングする。
      - 事務所見出し `<h2>` の下に、`<Link href="/vtuber/{id}">名前（登録者数）</Link>` を並べる。
      - h1 直下に要約文を置く。例: `Vちゃんねるでは${事務所数}事務所・${人数}人のVTuberの登録者数や配信情報をまとめています。`
    - `metadata`: title `VTuber一覧（事務所別）`、description に事務所数・人数を含める（`generateMetadata` で動的に生成）。
    - データ取得に失敗した場合は、従来のクライアント fetch にフォールバックする（ページを 500 にしない）。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `curl -s <URL>/vtuber` の HTML 本文に VTuber 名と `href="/vtuber/` リンクが含まれ、HTML サイズが 500KB 以下。
    - 完了報告に「Search Console で `/vtuber` のライブテストを再実行してください」と添える。
    - SEO-3 を `[x]`（S404-1 で対応済み）に更新する。

- [x] **S404-2. `/events` に今日のイベントをサーバーレンダリングする**
  - **対象ファイル**:
    `app/events/page.tsx`
    `components/EventCalendar.tsx`
  - **仕様**:
    - 現在 `EventCalendar` はマウントするまで「読み込み中…」を返している。これをやめ、サーバー側で **今日（JST）のイベント一覧**（名前・事務所・種別、詳細ページへの `<Link>`）を初期 HTML に描画する。
    - h1 直下に要約文を置く。例: `今日（11月10日）が誕生日・デビュー記念日のVTuberは${n}人です。`
    - カレンダー UI はマウント後に表示してよい。マウント前もサーバー描画した今日の一覧を残し、レイアウトのずれ（CLS）を最小にする。
    - `export const revalidate = 3600`。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `curl -s <URL>/events` の HTML 本文に今日のイベントの VTuber 名（0 件の日は「今日のイベントはありません」）が含まれる。

> **注**: `/vtuber/[channelId]` も同じ原因でソフト 404 になる。P0-AFF の後の **SEO-1** で対応する（優先度はそのまま）。

### P0-AFF: アフィリエイト組み込み — 楽天アフィリエイト（直接）に切り替え

> **2026-11-11 方針変更**:
> - もしもアフィリエイトは会員審査で否認された（再申請中）。**もしもの `a_id` やドメイン（`af.moshimo.com` / `i.moshimo.com` / `dn.msmstatic.com`）は今後一切使わない。**
> - 代わりに **楽天アフィリエイト（直接）** を使う。サイト登録済み（`https://vchannel-web.vercel.app/`、1位）。
> - **楽天アフィリエイトID: `5964c172.78b60cce.5964c173.d6c6def5`**（公開値。秘密情報ではない）。
> - 楽天管理画面で生成したリンクの実物（形式の正）:
>   ```html
>   <a href="https://hb.afl.rakuten.co.jp/hgc/5964c172.78b60cce.5964c173.d6c6def5/?pc=https%3A%2F%2Fwww.rakuten.co.jp%2F&link_type=text&ut=eyJwYWdlIjoidXJsIiwidHlwZSI6InRleHQiLCJjb2wiOjF9" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;">https://www.rakuten.co.jp/</a>
>   ```
> - 旧タスクの扱い:
>   - **AFF-1 / AFF-3**: もしも前提で実装済み（`[x]`）。本番では未表示。
>   - **AFF-4**: もしも版ウィジェットのため**実装しないこと**（AFF-7 で置き換え）。
>   - いずれも **AFF-6 で置き換える**。
> - Amazon は未提携のため、Amazon ボタンは引き続き出さない（もしも再審査の結果次第で別途起票）。

- [x] **AFF-6. `lib/affiliate.ts` を楽天アフィリエイト（直接）に書き換え、詳細ページ・イベントに楽天ボタンを設置**
  - **対象ファイル**:
    `lib/affiliate.ts`（全面書き換え）
    `components/AffiliateLinks.tsx`（新規作成。現在ファイルは存在しない）
    `app/vtuber/[channelId]/page.tsx`（または詳細の表示コンポーネント）
    `components/EventCalendar.tsx`
    `app/events/[date]/page.tsx`（SEO-4 実装済みの場合のみ）
  - **仕様（`lib/affiliate.ts`）**:
    - もしも関連（`PROGRAMS`、`RAKUTEN_DEFAULT_AID = "5890334"`、`CLICK_BASE`、`IMPRESSION_BASE`、`buildMoshimoUrl`、`buildMoshimoImpressionUrl`、`NEXT_PUBLIC_MOSHIMO_*`）を**すべて削除**する。
    - 定数 `RAKUTEN_AFFILIATE_ID = "5964c172.78b60cce.5964c173.d6c6def5"` を置く。環境変数 `NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID` があればそちらを優先する。
    - `buildRakutenAffiliateUrl(targetUrl: string): string | null`
      - 形式: `https://hb.afl.rakuten.co.jp/hgc/${id}/?pc=${encodeURIComponent(targetUrl)}&link_type=text`
      - `ut` パラメータは管理画面のリンク種別のメタ情報なので付けなくてよい。
      - ID が空なら `null` を返す。
    - `buildSearchUrl(keyword)`: `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(kw)}/`（既存ロジックを流用し、楽天のみにする）。
    - `isAffiliateEnabled()`: 楽天 ID があれば true。
    - ファイル冒頭のコメント（URL 手書き禁止、ID がなければ枠を出さない、遷移先は検索結果）は維持し、ASP 名を楽天アフィリエイトに更新する。
  - **仕様（`components/AffiliateLinks.tsx`）**:
    - Props: `keyword: string`, `heading?: string`（既定 `関連グッズ・CDを探す`）。
    - 「楽天市場で探す」ボタンを 1 つ表示する（lucide-react の `ShoppingBag`）。リンク属性は `target="_blank" rel="nofollow sponsored noopener"`。
    - 見出しの横に **`PR` バッジ**を必ず表示する。
    - インプレッション用の画像は不要（楽天直リンクには存在しない）。
    - `isAffiliateEnabled()` が false、または keyword が空なら `null` を返す。
    - Server Component でも Client Component でも使えるよう、hooks を使わない純粋な表示コンポーネントにする。
    - ダークモード対応。375px で崩れないこと。
  - **設置**:
    - VTuber 詳細ページ: 登録者推移グラフと最新動画の間。`keyword = ${name} グッズ`。**サーバーレンダリングの HTML に含まれること。**
    - `/events`: 選択日のイベント一覧の下に 1 つ。キーワード・見出しは旧 AFF-3 の仕様どおり（見出し `お祝いグッズを探す`、先頭イベントの `${name} グッズ`、0 件なら非表示）。
    - `/events/[date]`（存在する場合）: 一覧の下に 1 つ。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `grep -rn "moshimo\|msmstatic\|5890334" app components lib` が 0 件。
    - `curl -s <URL>/vtuber/<id>` の HTML に `hb.afl.rakuten.co.jp/hgc/5964c172.78b60cce.5964c173.d6c6def5/` と `PR` が含まれる。
    - リンクをクリックすると、楽天市場の「<VTuber名> グッズ」検索結果が開く。
    - `FRONTEND_SPEC.md` 5.11 を楽天アフィリエイト（直接）の内容に更新している。具体的には、もしもの記述と楽天ウィジェットの iframe 方針を削除し、提携状況を「楽天: 直接・利用中 / もしも: 再審査中 / Amazon: 未提携」とする。
    - `/privacy` の広告表記は AFF-5 の汎用文面のままでよい（変更不要）。

- [x] **AFF-7. 楽天モーションウィジェット（楽天直接版）をトップとランキングに設置** — ⏸ **人手でウィジェットコードを取得するまで着手しない**
  - **前提（人手作業）**: 楽天アフィリエイト管理画面「ツールを使う」→「モーションウィジェット」でコードを生成し、PM（Claude）に渡す。PM がこのタスクにコードを追記した時点で着手可能になる。
  - 仕様は旧 AFF-4 を踏襲する。
    - `<iframe srcDoc>` で隔離し、`<base target="_blank">` を付ける。
    - スマホは 300×250、PC は 600×200。
    - `PR` バッジを付ける。
    - 設置は `/` と `/ranking` の下部に各 1 つ。
    - JS の URL とパラメータは楽天が生成したコードに従う。

  - **PM 確認（2026-11-12）**: 実装されたのはモーションウィジェットではない。iframe の中にテキストリンク 1 本（楽天トップへのリンク）を置いただけの**仮実装**になっている。
    - 600×200 / 300×250 の枠がほぼ空白になる。
    - ダークモードでも背景が白い。
    - AFF-8 で本物のウィジェットに差し替える。

- [x] **AFF-8. 仮実装の `RakutenMotionWidget` を楽天公式モーションウィジェットに差し替え**（2026-11-12 着手可）
  - **対象ファイル**: `components/RakutenMotionWidget.tsx`（設置箇所の `app/page.tsx` / `app/ranking/page.tsx` は変更不要）
  - **楽天管理画面で生成したコード（2026-11-12、そのまま使う）**:
    ```html
    <script type="text/javascript">rakuten_design="slide";rakuten_affiliateId="5964c172.78b60cce.5964c173.d6c6def5";rakuten_items="ctsmatch";rakuten_genreId="0";rakuten_size="468x160";rakuten_target="_blank";rakuten_theme="gray";rakuten_border="off";rakuten_auto_mode="on";rakuten_genre_title="off";rakuten_recommend="on";rakuten_ts="1794402335560";</script><script type="text/javascript" src="https://xml.affiliate.rakuten.co.jp/widget/js/rakuten_widget.js?20230106"></script>
    ```
  - **PM 確認済み事項**:
    - `rakuten_widget.js` は `document.write` で描画するため、**iframe `srcDoc` での隔離が必須**。React ツリーや `next/script` に直接入れないこと。
    - JS が対応するサイズ一覧に `300x250` と `600x200` が含まれることを確認済み。
  - **仕様**:
    - 現在の `buildSrcDoc` のテキストリンクを削除する。代わりに上記 2 つの `<script>` を `srcDoc` の `<body>` に入れる。
    - 変数はコードどおりにする。ただし以下の 2 点だけ変える。
      - `rakuten_size`: スマホ用 iframe は `"300x250"`、PC用 iframe は `"600x200"`（`468x160` は使わない）。
      - `rakuten_affiliateId`: `lib/affiliate.ts` の `getRakutenAffiliateId()` から取る（値は同じ）。
      - それ以外（`design` / `items` / `genreId` / `target` / `theme` / `border` / `auto_mode` / `genre_title` / `recommend` / `ts`）と JS の URL（`?20230106` 含む）は**一字一句そのまま**使う。
    - `srcDoc` の `<head>` には `<meta charset="utf-8">`、`<base target="_blank">`、`<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style>` を入れる。現在の `background:#fff`、flex 中央寄せ、`padding:12px` は削除する。
    - iframe の `width` / `height` はサイズと一致させる（現状どおり）。外枠の `section`、`PR` バッジ、見出し `楽天市場のおすすめ`、`sm:hidden` / `hidden sm:flex` によるスマホ・PCの出し分けは現状を維持する。
    - `srcDoc` に埋め込む文字列は定数から組み立てる。外部入力は使わない。アフィリエイト ID が null なら何も描画しない（現状どおり）。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/` と `/ranking` の HTML（iframe の srcdoc 属性）に `xml.affiliate.rakuten.co.jp/widget/js/rakuten_widget.js?20230106` と `rakuten_size=&quot;600x200&quot;` / `&quot;300x250&quot;` が含まれる。
    - 「楽天市場のおすすめ商品を見る」のテキストリンクが残っていない。
    - `FRONTEND_SPEC.md` 5.11 のウィジェットの記述を「楽天公式モーションウィジェット（`rakuten_widget.js`）を iframe `srcDoc` で隔離、`300x250` / `600x200`」に更新している。

- [x] **AFF-9. 楽天モーションウィジェットの商品設定を「ランキング×ジャンル指定」に変更**（2026-11-12 着手可）
  - **背景**: AFF-8 の `rakuten_items="ctsmatch"`（コンテンツマッチ）は、iframe `srcDoc` 内では楽天側からページ本文が見えない。そのため、マスカラ・子ども服など VTuber と無関係な商品が表示された（2026-11-11 PM 確認）。
  - **対象ファイル**: `components/RakutenMotionWidget.tsx`
  - **楽天管理画面で再生成したコード（2026-11-12）**:
    ```html
    <script type="text/javascript">rakuten_design="slide";rakuten_affiliateId="5964c172.78b60cce.5964c173.d6c6def5";rakuten_items="ranking";rakuten_genreId="566382";rakuten_size="468x160";rakuten_target="_blank";rakuten_theme="gray";rakuten_border="off";rakuten_auto_mode="on";rakuten_genre_title="off";rakuten_recommend="on";rakuten_ts="1794402940420";</script><script type="text/javascript" src="https://xml.affiliate.rakuten.co.jp/widget/js/rakuten_widget.js?20230106"></script>
    ```
  - **仕様**:
    - `srcDoc` 内の変数を以下に変更する。それ以外は AFF-8 の実装（サイズ切替 `300x250` / `600x200`、`<base target="_blank">`、PR バッジ、設置箇所）を維持する。
      - `rakuten_items`: `"ctsmatch"` → **`"ranking"`**
      - `rakuten_genreId`: `"0"` → **`"566382"`**
      - `rakuten_ts`: → **`"1794402940420"`**
      - `rakuten_recommend`: **`"off"`**（再生成コードでは `"on"` だが、閲覧履歴ベースの無関係な商品を避けるため PM 判断で off にする。管理画面の「おすすめ商品を優先表示」と同じ設定）
    - 変数は定数オブジェクトにまとめ、どの値が楽天生成コード由来かをコメントで残す。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/` と `/ranking` の HTML（iframe の srcdoc 属性）に `rakuten_items=&quot;ranking&quot;`、`rakuten_genreId=&quot;566382&quot;`、`rakuten_recommend=&quot;off&quot;` が含まれ、`ctsmatch` が含まれない。
    - `FRONTEND_SPEC.md` 5.11 のウィジェット設定を「ランキング・ジャンル 566382・おすすめ優先 off」に更新している。

- [x] **AFF-5. プライバシーポリシーの広告表記から「もしもアフィリエイト」の記述を外す**（保留中でも着手する）
  - **対象ファイル**: `app/privacy/page.tsx`
  - **仕様**:
    - 「広告の掲載について」の文面を、特定の ASP 名を含まない以下の文に置き換える。
      > 当サイトでは、第三者が提供するアフィリエイトプログラムや広告配信サービスを利用して商品・サービスを紹介することがあります。リンク経由で商品が購入された場合などに、当サイトに報酬が支払われることがあります。広告であることが分かるよう「PR」と表記します。
    - 「Amazon アソシエイト」の節は削除する（Amazon と未提携のため。提携後に戻す）。
    - 改定日 `2026-11-11` を追記する（制定日は残す）。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/privacy` に「もしも」「Amazonアソシエイト」の文字列が含まれない。
    - `FRONTEND_SPEC.md` 5.11 の提携状況を「もしも: 否認（2026-11-11）、ASP 未定」に更新している。

> **以下は保留前の確定情報（参考。もしも否認により無効）**:
> - **楽天市場: 提携済み。もしも `a_id` = `5890334`**（楽天ウィジェットの HTML ソースで確認）。
>   - `a_id` は HTML に公開される値なので秘密情報ではない。`lib/affiliate.ts` に定数で持ち、環境変数 `NEXT_PUBLIC_MOSHIMO_RAKUTEN_AID` があればそちらを優先する。
> - **Amazon: 未提携（申請中）**。`NEXT_PUBLIC_MOSHIMO_AMAZON_AID` が未設定の間は Amazon ボタンを出さず、楽天だけを表示する。
>   - 提携後に人手で Vercel 環境変数を設定すれば、コード変更なしで Amazon ボタンが出る作りにすること。
> - 楽天の `p_id` / `pc_id` / `pl_id` は AFF-1 記載の初期値（`54 / 54 / 616`）で実装する。人手で「どこでもリンク」を 1 本生成して値が異なると分かった場合は、別途修正タスクを起票する。
> - `a_id` が取れないショップ（Amazon 未提携など）の枠は**一切表示しない**こと（アフィリエイトなしの素のリンクにもフォールバックしない）。

- [x] **AFF-2. 広告掲載に関する表記・プライバシーポリシーページ**（もしもメディア審査中のため AFF-1 より先に着手）
  - **対象ファイル**:
    `app/privacy/page.tsx`（新規）
    `components/SettingsList.tsx`
    `app/sitemap.ts`
  - **仕様**:
    - `/privacy` を新規作成し、`metadata.title` を `プライバシーポリシー・広告について` にする。以下の見出しを含める。
      - **広告の掲載について**: 「当サイトは、もしもアフィリエイトを利用したアフィリエイトプログラムに参加しており、Amazon・楽天市場等の商品を紹介しています。リンク経由で商品が購入された場合、当サイトに報酬が支払われることがあります。」
      - **Amazon アソシエイト**: 「Vちゃんねるは、Amazon.co.jpを宣伝しリンクすることによってサイトが紹介料を獲得できる手段を提供することを目的に設定されたアフィリエイトプログラムである、Amazonアソシエイト・プログラムの参加者です。」
      - **アクセス解析**: Vercel Analytics を利用している旨。
      - **ローカルストレージ**: お気に入り・事務所選択を端末内に保存している旨。
      - **お問い合わせ**: 既存の問い合わせ先（設定ページと同じメール）。
      - **制定日**: 2026-11-09。
    - `components/SettingsList.tsx` の「このアプリについて」付近に `/privacy` へのリンクを追加する。
    - `app/sitemap.ts` に `/privacy` を追加する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 設定ページから `/privacy` に遷移できる。
    - `FRONTEND_SPEC.md` の 5.10 / 5.11 を更新している。

- [x] **AFF-1. もしもリンク生成ユーティリティ＋商品導線コンポーネント＋VTuber詳細ページへの設置**
  - **対象ファイル**:
    `lib/affiliate.ts`（新規）
    `components/AffiliateLinks.tsx`（新規）
    `components/VTuberTabs.tsx`（`Detail` 内に設置）
  - **仕様**:
    - `lib/affiliate.ts`:
      - プログラム定数（`p_id` / `pc_id` / `pl_id`）を `as const` で定義する。初期値は Amazon `170 / 185 / 4062`、楽天 `54 / 54 / 616`（もしも公式の一般的な値）。**人手作業 2 で控えた値と異なる場合はそちらに合わせる**こと（コメントで明記）。
      - `buildMoshimoUrl(shop: "amazon" | "rakuten", targetUrl: string): string | null`
        - 形式: `https://af.moshimo.com/af/c/click?a_id=..&p_id=..&pc_id=..&pl_id=..&url=<encodeURIComponent(targetUrl)>`
        - 対応する `a_id` 環境変数が未設定なら `null` を返す。
      - `buildMoshimoImpressionUrl(shop)`: `https://i.moshimo.com/af/i/impression?a_id=..&p_id=..&pc_id=..&pl_id=..`（未設定なら `null`）。
      - 検索先 URL:
        - Amazon `https://www.amazon.co.jp/s?k=<kw>`
        - 楽天 `https://search.rakuten.co.jp/search/mall/<kw>/`
        - いずれも `encodeURIComponent` でエンコードする。
      - `isAffiliateEnabled(): boolean`（どちらか一方でも `a_id` があれば true）。
    - `components/AffiliateLinks.tsx`:
      - Props: `keyword: string`, `heading?: string`（既定 `関連グッズ・CDを探す`）。
      - 有効なショップごとにボタンを横並びで表示する（Amazon / 楽天市場）。lucide-react の `ShoppingBag` を使い、ブランドロゴ画像は使わない。
      - リンク属性: `target="_blank" rel="sponsored nofollow noopener"`。
      - 各リンクにインプレッション用の 1×1 `<img>`（`width={1} height={1} alt="" loading="lazy"`、`className="hidden"` は不可。`absolute opacity-0` などで不可視化）を添える。
      - 見出しの横に **`PR` バッジ**（小さい枠線付きラベル）を必ず表示する（ステマ規制対応）。
      - 有効なショップが 0 件なら `null` を返す。
      - ダークモード対応。375px で折り返しても崩れないこと。
    - `components/VTuberTabs.tsx` の `Detail`:
      - 「登録者数の推移」セクションと「最新動画」セクションの間に `<AffiliateLinks keyword={`${d.name} グッズ`} />` を設置する。
      - `d.name` が空の場合は表示しない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 環境変数を設定した状態で、VTuber 詳細ページに PR バッジ付きの Amazon・楽天ボタンが出る。クリックすると `af.moshimo.com` 経由で該当 VTuber 名の検索結果が開く。
    - 環境変数が未設定ならアフィリエイト枠が DOM に出力されない。
    - `FRONTEND_SPEC.md` の「5.11 収益化（アフィリエイト）」を実装内容に合わせて更新している。

- [x] **AFF-3. イベントカレンダー（誕生日・周年）への商品導線**
  - **対象ファイル**: `components/EventCalendar.tsx`
  - **仕様**:
    - 選択日のイベント一覧の下に、AFF-1 の `AffiliateLinks` を 1 つだけ設置する（**イベント行ごとには置かない**。行ごとに並べると過剰になるため）。
    - キーワード:
      - 選択日のイベントが 1 件なら `${name} グッズ`。
      - 2 件以上なら先頭イベントの `${name} グッズ`。
      - 0 件なら表示しない。
    - 見出しは `お祝いグッズを探す`。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - イベントのある日を選ぶと PR バッジ付きの導線が 1 つ表示され、イベントのない日は表示されない。

- [x] ~~**AFF-4. 楽天ウィジェット（もしも版・新 JS）をトップとランキングに設置**~~ — **廃止（2026-11-11、もしも否認のため）。実装しないこと。AFF-7 に置き換え。**
  - **対象ファイル**:
    `components/RakutenWidget.tsx`（新規・Client Component）
    `app/page.tsx`
    `app/ranking/page.tsx`
  - **元の HTML ソース（もしも管理画面で生成、2026-11-10）**:
    html
    <!-- MAF Rakuten Widget FROM HERE -->
    <script type="text/javascript">MafRakutenWidgetParam=function() { return{ size:'468x160',design:'slide',recommend:'on',auto_mode:'on',a_id:'5890334', border:'off'};};</script><script type="text/javascript" src="https://dn.msmstatic.com/site/rakuten/widget.js"></script>
    <!-- MAF Rakuten Widget TO HERE -->
    
    - JS は**新 URL `https://dn.msmstatic.com/site/rakuten/widget.js`** を使う（旧 `image.moshimo.com/...` は 2026-10 に停止済み。使用禁止）。
  - **仕様**:
    - ウィジェット JS は `document.write` 系の可能性があり、React ツリーや `next/script` に直接埋め込むとクライアント遷移時に動かない、またはページを壊すおそれがある。そのため **`<iframe srcDoc>` で隔離して描画する**。
      - `srcDoc` の中身は `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:0;overflow:hidden}</style></head><body>` ＋ 上記 2 つの `<script>` ＋ `</body></html>`。
      - `<base target="_blank">` により、ウィジェット内のリンクを iframe 内ではなく新しいタブで開く。
      - iframe 属性: `width` / `height` をサイズに一致させる。`loading="lazy"`、`title="楽天市場のおすすめ商品（広告）"`、`style={{ border: 0 }}`、`scrolling="no"`。
      - `sandbox` は付けない（リンク遷移と計測を阻害するため）。
    - **サイズのレスポンシブ切替**:
      - 画面幅 < 640px は `size:'300x250'`、それ以上は `size:'600x200'`（いずれも管理画面の選択肢にあるサイズ）。
      - `matchMedia` で判定し、マウント前は何も描画しない（高さ分のプレースホルダーで CLS を防ぐ）。
      - 375px 幅で横スクロールが出ないこと。
    - パラメータは上記のまま使う（`design:'slide'`、`recommend:'on'`、`auto_mode:'on'`、`border:'off'`）。`a_id` は `lib/affiliate.ts` の楽天 `a_id` を使う。
    - 枠の上に小さく `PR` バッジと見出し `楽天市場のおすすめ` を表示する（`AffiliateLinks` と同じバッジのスタイル）。
    - 楽天の `a_id` が取得できない場合は何も描画しない。
    - **設置箇所（各 1 つのみ）**:
      - `/`: 配信セクションの下（ページ末尾）
      - `/ranking`: ランキング一覧の下
    - 掲示板・VTuber 詳細・イベントには置かない（詳細とイベントは AFF-1 / AFF-3 の検索ボタンを使う）。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/` と `/ranking` の下部に楽天ウィジェットが表示される。商品をクリックすると新しいタブで `af.moshimo.com` 経由の楽天ページが開く。
    - クライアント遷移（他ページ → `/` → `/ranking`）を繰り返してもウィジェットが毎回表示され、ページが白くならない。
    - 375px / 1280px で横スクロールなし。ダークモードで枠周りが崩れない。
    - `FRONTEND_SPEC.md` 5.11 に、楽天ウィジェットの設置箇所と iframe 隔離の方針を追記している。

### P0-SEO: 検索流入・AI検索（AIO）対策（P0-AFF の次に着手）

> **背景（2026-11-09 調査）**: 訪問がほぼない主因は、検索で入口になるページがインデックスされていないこと。
> - `/vtuber/[channelId]` は全ページ共通タイトル「VTuber詳細」で、本文はクライアント fetch（初期 HTML に名前・数値がない）。
> - `sitemap.xml` は 6 URL のみ。
> - `/vtuber` 一覧には詳細ページへの `<a>` リンクがない。
>
> 「<VTuber名> 登録者数」「<VTuber名> 誕生日」「<月日> 誕生日 VTuber」といったロングテール検索の受け皿を作る。
>
> **前提（人手作業・Copilot は実施不要）**:
> - Google Search Console と Bing Webmaster Tools に本番ドメインを登録し、`/sitemap.xml` を送信する。Bing は ChatGPT 検索・Copilot の情報源。
> - Vercel の環境変数 `SITE_URL` に本番ドメインを設定する。

- [x] **SEO-1. VTuber 詳細ページのサーバーレンダリング化＋個別メタデータ＋構造化データ**
  - **対象ファイル**:
    `app/vtuber/[channelId]/page.tsx`
    `components/VTuberTabs.tsx`（`Detail` を表示専用に分離）
    `lib/server-data.ts`
  - **仕様**:
    - ページ（Server Component）で `loadVTubers()` から詳細を取得し、初期 HTML に以下が含まれるようにする。
      - 名前・事務所・登録者数・総再生数・動画本数・最新動画タイトル
      - `export const revalidate = 3600` を設定する。
      - 存在しない `channelId` は `notFound()` で 404 にする。
    - `Detail` は「データ取得」と「表示」を分ける。表示部分（`DetailView`）は props で `VTuberDetail` を受け取る。
      - `/vtuber` のタブ UI では、従来どおりクライアント側で取得して `DetailView` を使う。
      - 詳細ページでは、サーバーで取得したデータを `DetailView` に直接渡す。
      - グラフなどクライアント専用部分だけを `"use client"` にする。
    - `generateMetadata`:
      - title: `${name}の登録者数・配信情報`（テンプレートで `| Vちゃんねる` が付く）
      - description: `${office}所属のVTuber「${name}」のYouTube登録者数（${formatCompact}人）、登録者数推移、最新動画をまとめています。`
      - `alternates.canonical`: `/vtuber/${channelId}`
      - `openGraph.images`: チャンネルサムネイル
    - 本文の先頭（ヘッダー直下）に、AI 検索が引用しやすい要約文を `<p>` で入れる（**AIO 対策**）。
      - 例: `${name}は${office}に所属するVTuberです。2026年11月9日時点のYouTube登録者数は${formatNumber}人で、過去30日間で${増減}人増加しました。`
      - 日付は取得データの最新日付から作る。
    - JSON-LD（`<script type="application/ld+json">`、`<` は `\u003c` にエスケープ）を出す。
      - `ProfilePage`
        - `mainEntity`: `Person`。`name`、`image`、`affiliation`（`Organization`: office）、`sameAs`（`https://www.youtube.com/channel/${channelId}`）を持たせる。
        - `interactionStatistic`: `SubscribeAction` の件数。
      - `BreadcrumbList`: ホーム › VTuber › 名前
    - 画面上にパンくず（ホーム › VTuber › 名前）を表示し、既存の「‹ VTuber一覧」リンクを置き換える。
    - 同じ事務所の他メンバー（登録者数上位 12 人）へのリンク一覧（`<Link>`、サムネ＋名前）をページ下部に表示する（内部リンク強化）。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `curl -s <本番orローカル>/vtuber/<id> | grep <VTuber名>` で、初期 HTML に名前・要約文・JSON-LD が含まれる。
    - ページごとに `<title>` が異なる。
    - Google リッチリザルトテストで JSON-LD のエラーがない（手動確認）。
    - `FRONTEND_SPEC.md` 5.4 と「6.1 SEO / AIO 方針」を更新している。

- [x] **SEO-2. sitemap に全 VTuber 詳細ページを追加**
  - **対象ファイル**: `app/sitemap.ts`
  - **仕様**:
    - `loadVTubers()` の `index` から全 `channelId` を列挙して `/vtuber/${id}` を追加する。
      - `changeFrequency: "daily"`、`priority: 0.6`、`lastModified` は登録者推移の最新日付。
    - 5 万 URL を超える場合に備えて `generateSitemaps` で分割できる構造にする（現状 1 ファイルでよい）。
    - `export const revalidate = 86400`。
    - 取得に失敗しても、静的ページだけの sitemap を返す（ビルドを落とさない）。
  - **完了条件**:
    - `npm run build` が成功する。
    - `/sitemap.xml` に VTuber 詳細 URL が含まれる。

- [x] **SEO-3. `/vtuber` 一覧に、クロール可能な事務所別メンバーリンクを追加**
  - **対象ファイル**:
    `app/vtuber/page.tsx`
    `components/VTuberDirectory.tsx`（新規・Server Component）
  - **仕様**:
    - 既存のタブ UI の下に「事務所別VTuber一覧」セクションを置き、サーバーレンダリングする。
      - 事務所ごとに見出し（`<h2>`）を付け、メンバーを `<Link href="/vtuber/{id}">` で並べる（名前＋登録者数。画像なしで軽量に）。
      - 事務所は全件出す（選択事務所フィルターの影響を受けない）。メンバー数が多い事務所は `<details>` で折りたたんでよい（中身は HTML に出力する）。
    - `metadata` に以下を設定する。
      - title: `VTuber一覧（事務所別）`
      - description: 事務所数・人数を含める。
  - **完了条件**:
    - `npm run build` が成功する。
    - 初期 HTML に詳細ページへの `<a href="/vtuber/...">` が含まれる。

- [x] **SEO-4. 日付別「誕生日・周年のVTuber」ページ（366 ページ）**
  - **対象ファイル**:
    `app/events/[date]/page.tsx`（新規。`date` は `MM-DD`）
    `lib/events.ts`
    `app/sitemap.ts`
    `components/EventCalendar.tsx`
  - **仕様**:
    - `generateStaticParams` で `01-01`〜`12-31`（`02-29` 含む）を生成し、`revalidate = 86400` にする。不正値は 404。
    - h1 / title: `${M}月${D}日が誕生日・デビュー記念日のVTuber`
    - 冒頭に要約文を置く。例: `${M}月${D}日に誕生日を迎えるVTuberは${n}人、デビュー記念日（周年）を迎えるVTuberは${m}人です。`
    - 誕生日と周年をセクションに分けて一覧にする（サムネ・名前・事務所・`N周年`、名前は詳細ページへのリンク）。
    - 前日・翌日へのリンクを置き、`/events` のカレンダーからも日付ページへリンクする。
    - JSON-LD `ItemList` を出す（各要素は詳細ページ URL）。
    - sitemap に 366 URL を追加する。
    - AFF-3 の `AffiliateLinks` を一覧の下に 1 つ置く。
  - **完了条件**:
    - `npm run build` が成功する。
    - `/events/11-09` の初期 HTML に該当 VTuber 名が含まれる。

- [x] **SEO-5. AI 検索向け `llms.txt` とランキングの構造化データ**
  - **対象ファイル**:
    `app/llms.txt/route.ts`（新規）
    `app/ranking/page.tsx`
  - **仕様**:
    - `/llms.txt` で `text/plain; charset=utf-8` を返す（`revalidate = 86400`）。内容は以下。
      - サイト概要
      - 主要ページの URL と説明（ランキング・VTuber一覧・誕生日ページ・ニュース）
      - データの出典（YouTube 公開データ）と更新頻度
      - 登録者数上位 50 人の詳細ページ URL リスト
    - `/ranking`:
      - h1 直下に、集計期間と 1 位を含む要約文を置く。例: `11/03〜11/09の同時視聴者数ランキング1位は${name}（${n}人）です。`
      - ページ下部に「最終更新: yyyy/MM/dd HH:mm」を表示する。
      - 表示中タブの TOP10 を JSON-LD `ItemList` で出す。
  - **完了条件**:
    - `npm run build` が成功する。
    - `/llms.txt` が取得できる。
    - `/ranking` の初期 HTML に要約文と JSON-LD が含まれる。

- [x] **SEO-6. VTuber 詳細ページの動的 OGP 画像（X での共有 CTR 向上）**
  - **対象ファイル**: `app/vtuber/[channelId]/opengraph-image.tsx`（新規）
  - **仕様**:
    - `next/og` の `ImageResponse` で 1200×630 の画像を生成する。内容はサムネ・名前・事務所・登録者数（短縮表記）・サイト名。
    - 日本語フォントは Google Fonts の Noto Sans JP を `fetch` して埋め込む（必要な文字だけを `text=` パラメータで取得する）。
    - `twitter.card` を `summary_large_image` にする（詳細ページのみ）。
    - 範囲外: ランキングの OGP（P2-2 で扱う）。
  - **完了条件**:
    - `npm run build` が成功する。
    - `/vtuber/<id>/opengraph-image` が画像を返す。

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

- [x] **CHAT-2. Web 投稿の postNo 採番を「件数+1」から「最大 postNo+1（楽観ロック付き）」に変更**
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

- [x] **CHAT-3. 掲示板ルールをスレッドタブ列から分離（操作導線の改善）**
  - **対象ファイル**: `components/ChatBoard.tsx`, `FRONTEND_SPEC.md`
  - **実装内容**:
    - `📢 掲示板ルール` をスレッドタブの一員として横並びにしない。
    - スレッド一覧の上部に `📢 掲示板の注意事項` 固定パネルを配置し、`詳しく見る` / `折りたたむ` で開閉できるようにする。
    - スレッドタブは事務所スレッドのみを表示し、初期表示は先頭スレッドを自動選択する。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - 掲示板ルールがスレッドタブ列に表示されない。
    - 注意事項はスレッド一覧の上で開閉できる。

### P0-SEC: Next.js のセキュリティ更新（🚨最優先・2026-11-19 追加・他のすべてのタスクより先に着手）

- [x] **SEC-1. Next.js を脆弱性修正済みの最新パッチ版に上げる**
  - **背景（2026-11-19 PM 確認）**: ローカルの `npm run build` で `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability.` が出て、ビルドが止まった。現在の `next` は `16.4.4`、npm には `16.4.6` まである。本番の Vercel デプロイは今のところ通っているが、脆弱性を抱えたまま公開している状態になっている。
  - **対象ファイル**: `package.json`、`package-lock.json`（必要に応じて `eslint-config-next` も同じバージョンにそろえる）
  - **仕様**:
    - `next` を 16.4 系の最新パッチ版（2026-11-19 時点で `16.4.6`）に上げる。メジャー・マイナーは上げない。
    - Next.js 公式の手順（`npx next upgrade` など）か、`npm install next@16.4.6` で更新する。どちらを使ったかを完了報告に書く。
    - 更新後に、既存の画面の動作に変化がないことを確認する。特に `/`、`/ranking`、`/vtuber/{id}`、`/events/{MM-DD}`、`/guide/{slug}`、`/reports/{YYYY-MM}`、`/admin`（ログイン画面が出ること）。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。
    - `npm run build` が `SecurityFatalError` なしで、**1 回目の実行で**成功する。
    - `npm ls next` が 16.4.6 以上を示す。

### P0-OGFIX: VTuber 詳細ページの共有画像が 500 になる不具合（🚨最優先・2026-11-14 追加・P0-DOMAIN より先に着手）

- [x] **OGFIX-1. `/vtuber/[channelId]/opengraph-image` の 500 エラーを直し、どんな場合も画像を返すようにする**
  - **現象（2026-11-14 PM 確認、本番 `https://www.vchannel.net`）**:
    - 詳細ページの `og:image` / `twitter:image` は `/vtuber/{id}/opengraph-image` を指している（`twitter:card` は `summary_large_image`）。
    - 実在する VTuber の ID（例: `UC1DCedRgGHBdm81E1llLhOQ`、`UCoSrY_IQQVpmIRZ9Xf-y93g`）では **HTTP 500**（HTML のエラーページ）が返る。
    - 存在しない ID では 200 が返る（「VTuber詳細」だけの予備画像）。
    - このため、X などで詳細ページを共有しても画像が出ない。
  - **対象ファイル**: `app/vtuber/[channelId]/opengraph-image.tsx`
  - **原因の候補（PM 調査。実装前に必ずどれかを特定すること）**:
    1. **フォントのサブセットが固定文字列**（`"0123456789VTuber登録者数総再生数動画本数所属ちゃんねる"`）。VTuber 名・事務所名・`万` `億` `人` `（` `）` `,` `.` などの文字が含まれていない。
    2. **YouTube アイコン画像（`yt3.ggpht.com`）の埋め込み**。`ImageResponse` がサポートしない形式（WebP など）で返る、または取得に失敗している可能性がある。
    3. 上記以外の例外（データ取得など）。
    - 特定方法: `npm run build && npm start` で起動し、`curl -i localhost:3000/vtuber/UC1DCedRgGHBdm81E1llLhOQ/opengraph-image` を実行してサーバーログのスタックトレースを確認する。Vercel の Runtime Logs でも可。原因は完了報告に書くこと。
  - **仕様**:
    - **フォントの読み込み文字を動的にする**: 実際に描画する全文字列（VTuber 名、事務所名、統計行、`所属`、`SITE_NAME`、予備画像の文言）を連結し、重複を除いた文字集合を Google Fonts の `text=` パラメータに渡す。
      - キャッシュはテキストごとに持つ。もしくは文字集合をキーにしたメモ化でよい。
      - 固定文字列のモジュール変数キャッシュ（`fontDataPromise`）は廃止する。
    - **アイコン画像は事前に取得して data URL で渡す**:
      - サーバー側で `fetch(thumbnail, { headers: { Accept: "image/png,image/jpeg" } })` する。
      - `content-type` が `image/png` / `image/jpeg` のときだけ `data:` URL にして `<img src>` に渡す。
      - それ以外の形式や取得失敗時は、アイコン部分を頭文字入りの円などのプレースホルダーにする（画像全体は失敗させない）。
      - YouTube のアイコン URL の末尾サイズ指定（`=s800-...`）は `=s400-c-k-c0x00ffffff-no-rj` などに置き換えて軽くしてよい。
    - **どんな例外でも 500 を返さない**: 本体の描画を try/catch で囲み、失敗時はサイト名と「VTuber詳細」だけの予備画像（`ImageResponse`、200）を返す。`console.error` でエラー内容をログに残す。
    - `size`（1200×630）・`contentType`（`image/png`）・レイアウトは現状を維持する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - ローカルの `npm start` で、以下 3 件の `opengraph-image` がすべて **200 かつ `content-type: image/png`** になる。
      - `UC1DCedRgGHBdm81E1llLhOQ`（兎田ぺこら）
      - `UCoSrY_IQQVpmIRZ9Xf-y93g`（Gawr Gura）
      - 存在しない ID
    - 生成された PNG を開いて、VTuber 名・事務所名・「万」「人」などが**文字化け（□）せずに**表示されていることを目視で確認する。完了報告に確認した旨を書く。
    - 完了報告に、500 の原因（上記 1〜3 のどれだったか）を書く。
    - `FRONTEND_SPEC.md` の 6.1（SEO / AIO 方針）に「OGP 画像は失敗時も予備画像を返す」「フォントは描画文字から動的サブセット」を追記している。

### P0-DOMAIN: 独自ドメイン `vchannel.net` への移行（🚨最優先・2026-11-13 追加・P0-FILTER より先に着手）

> **背景**: 独自ドメイン `vchannel.net` を取得し、Vercel を Pro プランに変更した（Hobby は商用利用不可で、楽天アフィリエイト掲載と両立しないため）。Search Console 上の検索流入はまだほぼゼロなので、評価を持たない今のうちに正式な URL を **`https://www.vchannel.net`** に統一する。
>
> **人手で行う作業（Copilot は不要）**: Vercel の Domains で `www.vchannel.net` を本番、`vchannel.net` → `www.vchannel.net`（308）に設定済み。残りは、`vchannel-web.vercel.app` → `www.vchannel.net`（308）の転送設定、環境変数 `SITE_URL=https://www.vchannel.net`（Production）の設定、Search Console への `vchannel.net` ドメイン プロパティ追加（DNS TXT）とサイトマップ送信、旧プロパティでのアドレス変更ツールの実行。**リダイレクトは Vercel 側で行うため、`next.config.ts` に redirects を追加しないこと。**

- [x] **FIX-1. 🚨 VTuber 詳細ページの `Date.now()` プリレンダーエラーと、2MB 超 fetch キャッシュ警告を解消する**（DOMAIN-1 より先に着手）
  - **背景（2026-11-14 本番ログ）**:
    - `/vtuber/[channelId]` で `Error: Route "/vtuber/[channelId]": Next.js encountered the unstable value 'Date.now()' while prerendering.` が全詳細ページで出ている。原因は `app/vtuber/[channelId]/page.tsx` の本文が、同じ事務所のメンバー一覧を作るために `loadVTubers()` を**キャッシュなしで直接**呼んでいること。`loadVTubers` の `memo()`（`lib/server-data.ts`）が `Date.now()` を使うため、`cacheComponents` のプリレンダー中に不安定な値として検出される（`memo` のコメントどおり Route Handler 専用で、ページから直接呼んではいけない）。
    - `/api/streams` で `Failed to set Next.js data cache for .../allvideos.json` が出ている。`lib/gcs.ts` の `getAllVideos()` が、約 16MB の `allvideos.json` を既定の `revalidate` で fetch しており、Next.js の fetch キャッシュ上限（2MB）を超えるため。
  - **対象ファイル**: `app/vtuber/[channelId]/page.tsx`、`lib/server-data.ts`、`lib/gcs.ts`（＋ `getAllVideos` の呼び出し元 `lib/stream-data.ts`）
  - **仕様**:
    - `lib/server-data.ts` に `"use cache"` + `cacheLife("hours")` 付きの `getCachedOfficeMembers(office: string, excludeChannelId: string, limit = 12): Promise<VTuberIndexItem[]>` を追加する（登録者数の降順で上位 `limit` 件）。詳細ページはこれを使い、**`loadVTubers()` をページ・`generateMetadata`・`opengraph-image` から直接呼ばない**。
    - 同じ理由で、ページやレイアウト、`"use cache"` の外から `loadVTubers()` / `loadAllVideos()` を直接呼んでいる箇所がほかにないか `grep` で確認し、あれば同様に `"use cache"` 関数経由にする（Route Handler と `"use cache"` 関数の中からの呼び出しは可）。
    - 2MB を超える GCS ファイル（`officedataList.json`、`allvideos.json`）は fetch キャッシュに載せない。`getAllVideos()` は `fetchGcsJson(GCS_FILES.allVideos, 0)` にするか、`lib/server-data.ts` の `loadAllVideos()`（メモリ保持）に寄せる。どちらにしたかを `FRONTEND_SPEC.md` 2.1 に追記する。
    - 表示内容（同じ事務所のメンバー 12 人、並び順）は変えない。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。ビルドログに `Date.now()` の警告が出ない。
    - デプロイ後、Vercel の Runtime Logs で `/vtuber/...` の `unstable value 'Date.now()'` エラーと `/api/streams` の `Failed to set Next.js data cache` が出なくなる。
    - `/vtuber/{channelId}` の HTML に同じ事務所のメンバーへのリンクが従来どおり出る。

- [x] **DOMAIN-1. `SITE_URL` の本番フォールバックを `https://www.vchannel.net` にする**
  - **対象ファイル**: `lib/site.ts`
  - **仕様**:
    - `SITE_URL` の決め方を次の順にする: 環境変数 `SITE_URL` → `process.env.VERCEL_ENV === "production"` なら `"https://www.vchannel.net"` → `VERCEL_PROJECT_PRODUCTION_URL` → `http://localhost:3000`。末尾スラッシュの除去は現行どおり。環境変数の設定漏れがあっても、本番の canonical とサイトマップが旧ドメインや www なしにならないようにするため。
    - リポジトリ内に `vercel.app` や `vchannel.net` の URL を直書きしない（`lib/site.ts` のこの 1 か所だけ）。
    - `app/layout.tsx` の `verification.google`（旧 URL プレフィックス プロパティ用）は**消さない**（アドレス変更ツールで旧プロパティの確認が必要なため）。
    - `FRONTEND_SPEC.md` 1 章「本番ドメイン」（PM 更新済み）の記述と実装を一致させる。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - デプロイ後、`curl -s https://www.vchannel.net/sitemap.xml` の `<loc>` がすべて `https://www.vchannel.net/` で始まる。
    - `https://www.vchannel.net/ranking` の canonical が `https://www.vchannel.net/ranking` になっている。

- [x] **DOMAIN-2. canonical が無い公開ページに canonical を追加する**
  - **対象ファイル**: `app/page.tsx`、`app/vtuber/page.tsx`、`app/events/page.tsx`、`app/news/page.tsx`、`app/chat/page.tsx`、`app/privacy/page.tsx`
  - **仕様**:
    - 各ページの `metadata` / `generateMetadata` に `alternates: { canonical: "<パス>" }` を追加する（`/`、`/vtuber`、`/events`、`/news`、`/chat`、`/privacy`）。`metadataBase` が `SITE_URL` なので、相対パスで書けば絶対 URL になる。
    - 既存の title / description は変えない。`generateMetadata` の `catch` 側（フォールバック）にも canonical を入れる。
    - `/favorites` と `/settings` は robots で disallow 済みのため対象外。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - 上記 6 ページの HTML に `<link rel="canonical" href="https://www.vchannel.net/...">` が 1 つだけ出る（本番）。
    - `FRONTEND_SPEC.md` 6.1（PM 更新済み）の記述と実装が一致している。

### P0-INDEX: 「クロール済み - インデックス未登録」を減らす（2026-11-16 追加・P0-DOMAIN の次、P0-NAV より先に着手）

> **背景（2026-11-16 Search Console）**: `vchannel.net` ドメイン プロパティで、登録済み 19 件・未登録 464 件。未登録の理由は 1 種類で、すべて「**クロール済み - インデックス未登録**」だった。Google はページを読んだうえで、「登録する価値が低い」と判断している。新しいドメインで評価がまだ低いことも一因だが、ページ側の原因は次の 3 つ。
>
> - (1) **VTuber 詳細（約 1,500 ページ）の文章がテンプレートのみ**: 本文のテキストは約 900 文字で、名前と数字以外は全ページ同じ文章。登録者数が丸められているため、多くのページで「過去30日間の増減は確認できませんでした。」になる。「個人に所属するVTuberです」という不自然な文もある。
> - (2) **「個人」のページ（738 人・全体の約半分）は「同じ事務所のVTuber」がどのページも同じ 12 人**: 個人勢の登録者数上位（海外のチャンネルを含む）が並ぶだけで、そのページの VTuber と関係がない。738 ページに同じブロックが重複している。
> - (3) **日付別イベント（366 ページ）は 1 日あたり 1〜5 人ほどの短い一覧**: 0〜1 人しかいない日もある（例: 11/19、12/28 は 1 人）。title に VTuber 名が入っていないため、「〇〇 誕生日」の検索にも合いにくい。
>
> **方針**: 既にあるデータ（登録者数・総再生数・動画本数・誕生日・デビュー日・全 VTuber の順位）から、**ページごとに違う文章とリンク**を増やす。新しい GCS ファイルやバックエンドの変更は不要。見た目は既存のトーンに合わせる（Tailwind・lucide-react）。
>
> **完了後に PM が行うこと**: 1〜2 週間後に Search Console の「ページ」で、未登録件数の推移を確認する。

- [x] **IDX-1. VTuber 詳細の本文を、そのページにしかない文章にする（順位・数値・よくある質問）**
  - **対象ファイル**: `app/vtuber/[channelId]/page.tsx`、`lib/server-data.ts`
  - **仕様**:
    - `lib/server-data.ts` に、`"use cache"` + `cacheLife("hours")` 付きの `getCachedVTuberRanks(channelId: string): Promise<{ overall: number; total: number; inOffice: number; officeTotal: number } | null>` を追加する。`loadVTubers()` の `index` を登録者数の降順に並べた順位（全体・同じ `office` 内）を返す。同じ数は同じ順位にしなくてよい（並び順どおり）。ページから `loadVTubers()` を直接呼ばないルール（FIX-1）は守る。
    - `buildSummary` を次のように直す。
      - `office === "個人"` のときは「〇〇は個人で活動するVTuberです。」、それ以外は「〇〇は{office}に所属するVTuberです。」。
      - 30 日の増減が 0 のときは「過去30日間の登録者数は横ばいです。」、`transition` が 2 件未満のときは増減の文を出さない（「確認できませんでした」は使わない）。
      - 「Vちゃんねるに登録している{total}人のVTuberのうち、登録者数は{overall}位です。」を加える。事務所所属なら「{office}の中では{officeTotal}人中{inOffice}位です。」も加える。
      - 「YouTubeの総再生数は{formatCompact(viewCount)}回、動画本数は{videoCount}本です。」を加える（`viewCount` / `videoCount` が 0 のときは省く）。
    - ページの最後（関連 VTuber の下）に **「よくある質問」** セクション（`<h2>` + `<dl>`）を置く。データがある項目だけ出す。
      - 「{name}のYouTube登録者数は？」→「{日付}時点で{formatNumber}人（全体{overall}位）です。」
      - 「{name}の誕生日はいつ？」→「{m}月{d}日です。」＋同じ日の一覧 `/events/MM-DD` への `<Link>`（「{m}月{d}日が誕生日のVTuberを見る」）
      - 「{name}のデビュー日はいつ？」→「{y}年{m}月{d}日です。」＋ `/events/MM-DD` への `<Link>`。`year` があれば、今年で何周年かも書く（JST の現在年は既存の `"use cache"` パターンで取得し、プリレンダー中に `Date.now()` を直接使わない）。
      - 「{name}はどこの事務所？」→ 事務所名、または「個人で活動しています。」
    - FAQ の構造化データ（FAQPage）は**付けない**（Google のリッチリザルト対象外のため）。既存の JSON-LD は変えない。
    - 誕生日・デビュー日の表示（`DetailView` 内）は変えない。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。ビルドログに `Date.now()` の警告が出ない。
    - `curl -s <URL>/vtuber/UCt30jJgChL8qeT9VPadidSw`（しぐれうい・個人）の本文に「個人で活動する」「位です」「よくある質問」「/events/05-30」が含まれ、「確認できませんでした」「個人に所属」が含まれない。
    - `FRONTEND_SPEC.md` の VTuber 詳細ページの節に、要約文のルールと「よくある質問」の項目を追記する。

- [x] **IDX-2. 「同じ事務所のVTuber」を、そのページに合った関連 VTuber にする**（IDX-1 の次に着手）
  - **対象ファイル**: `app/vtuber/[channelId]/page.tsx`、`lib/server-data.ts`
  - **仕様**:
    - `lib/server-data.ts` に、`"use cache"` + `cacheLife("hours")` 付きの `getCachedNearbyVTubers(channelId: string, limit = 12): Promise<VTuberIndexItem[]>` を追加する。全 VTuber を登録者数の降順に並べ、その VTuber の**前後 `limit / 2` 人ずつ**（端では片側を多めにして合計 `limit` 人）を返す。本人は含めない。
    - `office === "個人"` のページは、「同じ事務所のVTuber（登録者数上位）」を出さず、代わりに **「登録者数が近いVTuber」**（`getCachedNearbyVTubers`、12 人）を出す。カードには名前の下に登録者数（`formatCompact`）を小さく出す。
    - 事務所所属のページは、既存の「同じ事務所のVTuber（登録者数上位）」（12 人）をそのまま残し、その下に「登録者数が近いVTuber」（6 人）を追加する。同じ事務所のブロックと重複する人は除く。
    - カードの見た目は既存の事務所メンバーのカードと同じにする（共通コンポーネントに切り出してよい）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - 個人の VTuber 2 人のページで、関連 VTuber のブロックが**違う顔ぶれ**になっている（`curl` の HTML で `href="/vtuber/` の並びを比較）。
    - 事務所所属のページに、2 つのブロックが重複なしで出る。
    - `FRONTEND_SPEC.md` の VTuber 詳細ページの節に、関連 VTuber の出し分けを追記する。

- [x] **IDX-3. 日付別イベントページを厚くする（title に名前・前後の日・0 件の日は noindex）**（IDX-2 の次に着手）
  - **対象ファイル**: `app/events/[date]/page.tsx`、`app/sitemap.ts`、新規 `lib/events-data.ts`（サーバー専用）
  - **仕様**:
    - `app/events/[date]/page.tsx` の `getEventsMap()`（`"use cache"` + `cacheLife("days")`）を `lib/events-data.ts` に移し、ページとサイトマップの両方から使う。
    - **title と description に VTuber 名を入れる**: その日の VTuber を登録者数の多い順（イベントデータに登録者数が無ければデータの並び順）に最大 3 人選び、title を「{m}月{d}日が誕生日・デビュー記念日のVTuber（{名前1}・{名前2}ほか）」にする。1 人なら「（{名前1}）」、0 人なら現行の title のまま。description にも同じ名前を入れる。
    - ページの最後に **「前後の日の誕生日・記念日」** セクションを追加する。前後 3 日（計 6 日）について、日付の見出し（`/events/MM-DD` へのリンク）と、その日の VTuber 名（詳細ページへのリンク、最大 5 人＋「ほか N 人」）を並べる。0 人の日は「該当なし」とだけ書く。
    - その日の誕生日・記念日が**合計 0 人**のときは、`generateMetadata` で `robots: { index: false, follow: true }` にし、`app/sitemap.ts` の `eventDateEntries` からも除く（`eventDateEntries` は async にし、`lib/events-data.ts` を使う。取得に失敗したときは現行どおり全日付を出す）。ページ自体は 200 のまま表示する。
    - 既存の「誕生日」「デビュー記念日（周年）」の一覧、前日・翌日リンク、JSON-LD、アフィリエイトは変えない。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - `curl -s <URL>/events/05-30` の `<title>` に VTuber 名が含まれ、本文に「前後の日の誕生日・記念日」と前後 3 日分のリンクがある。
    - 0 人の日があれば、その日の HTML に `noindex` が出て、`/sitemap.xml` にその日の URL が無い（0 人の日が無ければ、その旨を完了報告に書く）。
    - `FRONTEND_SPEC.md` の日付別イベントページの節に、title のルール・前後の日セクション・noindex の条件を追記する。

- [x] **IDX-4. IDX-1〜3 の細かい修正（PM レビュー 2026-11-17）**（IDX-3 の次。小粒なので次の 1 件として着手してよい）
  - **対象ファイル**: `app/vtuber/[channelId]/page.tsx`、`lib/server-data.ts`
  - **仕様**:
    - **「今年で0周年です」を出さない**: よくある質問のデビュー日で、`currentYear - debut.year` が 1 以上のときだけ「今年で N 周年です。」を出す（今年デビューの人や、自動登録で `debut.year` が今年の人で 0 周年・マイナスにならないようにする）。
    - **事務所所属ページの「登録者数が近いVTuber」を上下均等にする**: 現在は前後 24 人の窓から同じ事務所の人を除いて**先頭から** 6 人取っているため、自分より登録者数が多い人ばかりになる。`getCachedNearbyVTubers` の結果を、本人との順位の差（近い順）で並べ直してから除外・6 人に絞る（上下交互になるのが理想）。個人ページ（12 人）の並びは今のまま（登録者数の降順）でよい。表示順は最終的に登録者数の降順に戻す。
    - **事務所公式チャンネルを順位に含めない**: `getCachedVTuberRanks` と `getCachedNearbyVTubers` で `officeFlg === true`（事務所の公式チャンネル、現在 24 件）を除いて順位・総数を数える。公式チャンネル自身のページでは順位の文（「〇位です」・FAQ の「（全体〇位）」）を出さない（`ranks` を `null` にする）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - 宝鐘マリン（`UCCzUftO8KOVkV4wQG1vkUvg`）のページの「登録者数が近いVTuber」6 人に、マリンより登録者数が多い人と少ない人の両方が含まれる。
    - 事務所公式チャンネルのページ（例: `officeFlg` が true の任意の 1 件）に「位です」が出ない。しぐれういのページの総数が、公式チャンネル分だけ減っている（1,557 → 約 1,533）。
    - `FRONTEND_SPEC.md` の VTuber 詳細ページの節に、上の 3 点を追記する。

### P0-LIVEFIX: URL から開いた直後の「配信中」が古い（🚨最優先・2026-11-18 追加・P0-ADSENSE より先に着手）

> **調査結果（2026-11-18 PM）**: スマホで URL から開くと、配信中タブに古い一覧が出る。更新ボタンを押すと最新になる。原因は 2 つ。
> 1. **サーバー側のキャッシュ（主因）**: `getLiveVideoList()` は `fetch(..., { next: { revalidate: 60 } })` で GCS を取得する。この設定は「期限切れでも、まず古いデータを返して裏で更新する」（stale-while-revalidate）。アクセスが少ない時間帯は、**期限切れ後の最初の 1 回が、前回アクセス時点の古い一覧になる**。前回が数時間前なら数時間前の一覧が出る。直後に更新ボタンを押すと、裏で更新済みの新しいデータが返るので直る。STREAM-1 で 300 → 60 秒にしたが、この仕組みは変わっていない。
> 2. **ブラウザの戻る／タブ復帰（副因）**: iOS Safari などは、ページを丸ごとメモリに残して復元する（bfcache）。この場合 `StreamTabs` は再マウントされず、`visibilitychange` も来ないことがあるため、前に表示した一覧のまま残る。
>
> ※ `/api/streams` 自体は `Cache-Control: no-store` で、Vercel の CDN キャッシュ（`x-vercel-cache: MISS`）やブラウザキャッシュは原因ではない。GCS 側は `max-age=60` のため、最大でも 60 秒の遅れにとどまる（バックエンドの更新間隔は 5 分）。

- [x] **STREAM-3. 配信中の一覧を、開いた直後から最新にする**
  - **対象ファイル**:
    `lib/gcs.ts`
    `components/StreamTabs.tsx`
  - **仕様**:
    - `getLiveVideoList()` だけ、Next.js のデータキャッシュを使わずに毎回 GCS から取得する（`fetch` に `cache: "no-store"` を指定）。
      - `fetchGcsJson` に、`revalidate` の代わりに `"no-store"` を渡せるようにする（例: 第 2 引数を `number | "no-store"` にし、`"no-store"` のときは `{ cache: "no-store" }` で fetch する）。他の呼び出し元の挙動は変えない。
      - `weeklyLiveViewRanking.json`（`REVALIDATE.live` のもう 1 か所の利用）と `getTrimmedStreamVideos()`（配信予定・過去アーカイブ用）は変更しない。
      - 不要になる場合は `REVALIDATE.live` を残してよい（`weeklyLiveView` が使っているため）。
    - `StreamTabs` で `pageshow` イベントを購読し、`event.persisted === true`（bfcache から復元された）なら `load()` を呼ぶ。購読はアンマウント時に解除する。
      - 既存の `visibilitychange`（60 秒以上経っていたら再取得）と 3 分ごとの自動更新はそのまま残す。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `grep -n "no-store" lib/gcs.ts` で、`livevideoList` の取得に `no-store` が使われていることが分かる。
    - （デプロイ後）しばらくアクセスがない状態で `curl -s https://www.vchannel.net/api/streams` の `liveVideos` の件数・videoId が、`curl -s "https://storage.googleapis.com/vtuber-335811.appspot.com/livevideoList.json?x=$RANDOM"` と一致する（GCS の 60 秒キャッシュ分の差は許容）。
    - `FRONTEND_SPEC.md` のキャッシュ方針（「ライブ関連は `livevideoList.json` を…」の行）を、`/api/streams` の配信中データは毎回 GCS から取得する、に更新する。

### P0-ADSENSE: Google AdSense 審査の準備（2026-11-17 追加・P0-INDEX の次、P0-NAV より先に着手）

> **背景（2026-11-17 PM 調査）**: 本番 `https://www.vchannel.net` を AdSense の審査基準と照らし合わせた。今のままでは不合格になる可能性が高い。
> - ❌ プライバシーポリシーに Google AdSense・Cookie の記載がない。
> - ❌ プライバシーポリシーへのリンクが設定ページ内にしかない（設定ページは robots.txt で除外）。
> - ❌ 運営者情報（`/about`）、お問い合わせ（`/contact`）、利用規約（`/terms`）がない。
> - ❌ 人が書いた独自の文章が少ない。ページの大半はデータの自動表示で、ニュースは外部記事へのリンク集。
> - △ 掲示板（ユーザー投稿）に不適切な投稿が載るリスクがある。
>
> **共通ルール**:
> - 問い合わせ先メールアドレスは **`vchannel.com.info@gmail.com`**（ユーザー指定）。
> - 運営者名は **「Vちゃんねる運営事務局」**。個人名・住所は載せない。
> - 新しいページはすべてサーバーレンダリングにし、`generateMetadata`（title / description / canonical）を付け、sitemap に追加する。
> - AdSense の広告タグ（`adsbygoogle.js`）は**審査に合格するまで入れない**（ADS-9 で扱う）。

- [x] **ADS-1. 問い合わせ先を定数にまとめ、全ページ共通のフッターを追加する**
  - **対象ファイル**:
    `lib/site.ts`
    `components/SiteFooter.tsx`（新規）
    `components/AppShell.tsx`
    `app/privacy/page.tsx`
    `components/SettingsList.tsx`
  - **仕様**:
    - `lib/site.ts` に `CONTACT_EMAIL = "vchannel.com.info@gmail.com"` と `OPERATOR_NAME = "Vちゃんねる運営事務局"` を追加する。
      - `app/privacy/page.tsx` と `components/SettingsList.tsx` にあるローカル定数 `CONTACT_EMAIL` は削除し、`lib/site.ts` を参照する。
    - `SiteFooter` を作り、`AppShell` で全ページのメインコンテンツの下に表示する（`/admin` 配下は除く）。
      - リンク（`<Link>`）: このサイトについて（`/about`）、お問い合わせ（`/contact`）、利用規約（`/terms`）、プライバシーポリシー（`/privacy`）、ガイド・特集（`/guide`、ADS-6 で作成）。
      - 著作権表記: `© 2026 Vちゃんねる`
      - 非公式表記: 「当サイトは非公式のファンサイトであり、各VTuber・所属事務所とは関係ありません。」
    - スマホでは画面下の固定ナビ（`BottomNav`）にフッターが隠れないよう、下側に余白を確保する。375px で横スクロールが出ないこと。ダークモード対応。
    - サーバーレンダリングの HTML にフッターのリンクが含まれること。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/`、`/ranking`、`/vtuber/{id}` の HTML に、`href="/privacy"`、`href="/about"`、`href="/contact"`、`href="/terms"` が含まれる。
    - `grep -rn '"vchannel.com.info@gmail.com"' app components lib` の結果が `lib/site.ts` の 1 件だけ。

- [x] **ADS-2. 運営者情報ページ `/about` を作る**
  - **対象ファイル**: `app/about/page.tsx`（新規）、`app/sitemap.ts`
  - **仕様**:
    - title: `このサイトについて（運営者情報）`
    - 本文に以下の見出しを入れる。
      - **Vちゃんねるとは**: VTuber の配信スケジュール・登録者数ランキング・誕生日やデビュー記念日・ニュースをまとめたファンサイトであること、想定読者（推しの活動を追いかけたいファン）、主な機能（各ページへのリンク付き）。
      - **掲載データについて**: YouTube の公開データを定期的に集計していること、更新頻度（配信情報は数分〜1時間、登録者数は1日1回）。数値は集計時点のもので、公式発表と異なる場合があること。
      - **運営者**: `OPERATOR_NAME`、連絡先 `CONTACT_EMAIL`（`/contact` へのリンクも）。
      - **免責事項・権利について**: 非公式ファンサイトであり各事務所とは無関係であること。掲載している画像・動画・名称の権利は各権利者に帰属すること。掲載内容の修正・削除の依頼は `/contact` から受け付けること。
      - **広告について**: アフィリエイト（PR 表記）と広告配信サービスを利用していること。詳細は `/privacy` へ。
    - JSON-LD: `AboutPage` と `Organization`（name: SITE_NAME、email: CONTACT_EMAIL、url: SITE_URL）。
  - **完了条件**:
    - `npm run build` が成功する。
    - `/about` が 200 で、上記の見出しがすべて HTML に含まれる。sitemap に `/about` がある。

- [x] **ADS-3. お問い合わせページ `/contact` を作る**
  - **対象ファイル**: `app/contact/page.tsx`（新規）、`app/sitemap.ts`
  - **仕様**:
    - title: `お問い合わせ`
    - フォームのバックエンドは作らない。**メール（`mailto:`）で受け付ける**。
    - 用件別に、件名入りの `mailto:` リンクボタンを並べる（件名は `encodeURIComponent` でエンコードする）。
      - `掲載情報の修正依頼`
      - `掲載内容の削除依頼（権利者の方）`
      - `掲示板の投稿の通報`
      - `広告・提携に関するお問い合わせ`
      - `その他のお問い合わせ`
    - メールアドレス自体もテキストで表示する（コピーできるように）。
    - 注意書き: 返信までに数日かかる場合があること。VTuber 本人や事務所へのメッセージは取り次げないこと。
  - **完了条件**:
    - `npm run build` が成功する。
    - `/contact` が 200 で、5 つの `mailto:vchannel.com.info@gmail.com?subject=...` リンクが HTML に含まれる。sitemap に `/contact` がある。

- [x] **ADS-4. 利用規約ページ `/terms` を作る**
  - **対象ファイル**: `app/terms/page.tsx`（新規）、`app/sitemap.ts`、`components/ChatBoard.tsx`（規約へのリンク追加のみ）
  - **仕様**:
    - title: `利用規約`
    - 見出し:
      - **適用**
      - **掲示板の利用について**: 禁止事項は、既存の掲示板ルールと同じ内容（誹謗中傷・個人情報・なりすまし・スパム・違法/不快なコンテンツなど）に、「性的な内容」「差別的な表現」「他サイトへの誘導・宣伝」を加える。運営者が不適切と判断した投稿は予告なく削除・非表示にできること。
      - **免責事項**: 掲載データの正確性を保証しないこと。外部リンク先の内容に責任を負わないこと。
      - **著作権**
      - **規約の変更**
      - **お問い合わせ**（`/contact` へのリンク）
      - **制定日**: `2026-11-17`
    - 掲示板の投稿画面（投稿ボタン付近）に「投稿前に[利用規約](/terms)をお読みください」のリンクを追加する。
  - **完了条件**:
    - `npm run build` が成功する。
    - `/terms` が 200 で、sitemap に含まれる。掲示板の投稿画面に `/terms` へのリンクがある。

- [x] **ADS-5. プライバシーポリシーに Google AdSense と Cookie の記載を追加する**
  - **対象ファイル**: `app/privacy/page.tsx`
  - **仕様**:
    - title を `プライバシーポリシー` にする（「・広告について」は外す。広告の説明は本文の見出しで扱う）。
    - 以下の見出しを追加・整理する。既存の「広告の掲載について」「アクセス解析」「ローカルストレージ」「お問い合わせ」は残す。
      - **広告配信について（Google AdSense）**: 当サイトは第三者配信の広告サービス「Google AdSense」を利用する（予定を含む）こと。以下の Google 指定の内容を、日本語で必ず含める。
        - Google などの第三者配信事業者が Cookie を使用して、ユーザーが当サイトや他のウェブサイトに過去にアクセスした際の情報に基づいて広告を配信すること。
        - Google が広告 Cookie を使用することにより、ユーザーが当サイトや他のサイトにアクセスした際の情報に基づいて、Google やそのパートナーが適切な広告を表示できること。
        - ユーザーは [広告設定](https://adssettings.google.com/) でパーソナライズ広告を無効にできること。また [www.aboutads.info](https://www.aboutads.info/) にアクセスすれば、パーソナライズ広告に使われる第三者配信事業者の Cookie を無効にできること。
        - Google のポリシーへのリンク: [広告 – ポリシーと規約 – Google](https://policies.google.com/technologies/ads)
      - **Cookie について**: Cookie の概要と、ブラウザの設定で無効にできること。
      - **個人情報の取り扱い**: お問い合わせのメールで受け取った情報は、返信と対応のためだけに使うこと。
      - **掲示板への投稿**: 投稿された名前・本文は公開されること。個人情報を書き込まないこと。
      - **免責事項**: 外部リンク先については責任を負わないこと。
    - 運営者名 `OPERATOR_NAME` と連絡先 `CONTACT_EMAIL` を記載する（`lib/site.ts` から参照）。
    - 改定日を `2026-11-17` に更新する（制定日は残す）。
  - **完了条件**:
    - `npm run build` が成功する。
    - `/privacy` の HTML に `Google AdSense`、`Cookie`、`adssettings.google.com`、`aboutads.info`、`policies.google.com/technologies/ads` が含まれる。

- [x] **ADS-6. ガイド・特集記事の仕組み（`/guide`）を作る**
  - **目的**: 人が書いた独自の文章を載せる場所を作る。記事の本文は PM（Claude）とユーザーが Markdown で書くので、Copilot は**仕組みだけ**を作る。サンプル記事 1 本を同梱する。
  - **対象ファイル**:
    `content/guide/*.md`（新規ディレクトリ）
    `lib/guide.ts`（新規）
    `app/guide/page.tsx`（新規）
    `app/guide/[slug]/page.tsx`（新規）
    `app/sitemap.ts`
  - **仕様**:
    - 記事は `content/guide/{slug}.md`。フロントマターは `title`、`description`、`publishedAt`（YYYY-MM-DD）、`updatedAt`（任意）、`category`（`事務所紹介` / `データ解説` / `使い方・入門`）、`relatedVtubers`（任意。channelId の配列）。
    - パースには `gray-matter`、Markdown → HTML には `marked` を追加して使う。記事は自分たちで書くものなので、サニタイズは不要。
    - `lib/guide.ts`: `getAllGuides()`（`publishedAt` の新しい順）、`getGuide(slug)`。ビルド時に読み込む。
    - `/guide/[slug]`:
      - `generateStaticParams` で全記事を静的生成する。存在しない slug は 404。
      - パンくず（ホーム › ガイド・特集 › 記事名）。
      - 本文の先頭に、公開日・更新日・運営者名を表示する。
      - `relatedVtubers` があれば、本文の下に詳細ページへのリンクカードを表示する。
      - JSON-LD: `Article`（headline、datePublished、dateModified、author: Organization `OPERATOR_NAME`）と `BreadcrumbList`。
      - Markdown の見出し・段落・リスト・表・リンクが Tailwind で読みやすく表示されること（`prose` 相当のスタイル。`@tailwindcss/typography` の追加も可）。
    - `/guide`: カテゴリ別の記事一覧（タイトル・説明・公開日）。
    - トップページの下部に「ガイド・特集」の新着 3 件を表示する。
    - sitemap に `/guide` と全記事を追加する（`lastModified` は `updatedAt ?? publishedAt`）。
    - **サンプル記事**: `content/guide/how-to-use.md`（`使い方・入門`）を 1 本作る。内容は「Vちゃんねるの使い方」として、各ページの機能（配信・ニュース・VTuber・ランキング・誕生日・掲示板）を説明する。800 字以上で、各機能のページへのリンクを入れる。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/guide` と `/guide/how-to-use` が 200 で、本文が HTML に含まれる。sitemap に含まれる。
    - `content/guide/` に `.md` を 1 本追加するだけで記事が増えることを、`FRONTEND_SPEC.md` に手順として書いている。

- [x] **ADS-7. 月間レポートページ（データから作る独自の分析記事）**（ADS-6 の次に着手）
  - **目的**: データの自動表示だけでなく、「先月と比べて何が起きたか」を文章で説明するページを作る。数値の比較から文を組み立てるので、毎月自動で更新される独自コンテンツになる。
  - **対象ファイル**: `app/reports/[month]/page.tsx`（新規。`month` は `YYYY-MM`）、`app/reports/page.tsx`（新規）、`lib/reports.ts`（新規）、`content/reports/{YYYY-MM}.md`（任意の編集部コメント）、`app/sitemap.ts`
  - **仕様**:
    - 対象は、今月（集計途中であることを明記）と、データが取れる過去月。データがない月は 404。
    - セクション（データから文章を組み立てる）:
      - **登録者の伸び TOP10**: 増加数と増加率。1 位について「〇〇が △△人増え、伸び率は □□% でした」のように文章で説明する。
      - **事務所別の伸び**: 事務所ごとの合計増加数の上位 5 事務所。
      - **同時視聴者数の大きかった配信 TOP10**（週間データから月内のものを集計できる範囲で）。
      - **今月の誕生日・デビュー記念日**: 人数と、登録者数の多い順に上位 10 人。
      - 各 VTuber 名は詳細ページへのリンクにする。
    - `content/reports/{YYYY-MM}.md` があれば、その本文を「編集部コメント」としてページ冒頭に表示する（なくてもページは成立する）。
    - title: `{YYYY}年{M}月のVTuber月間レポート｜登録者の伸び・人気配信まとめ`
    - JSON-LD `Article`。`/reports` は月の一覧。フッターと `/guide` から `/reports` へリンクする。
    - データ取得元は既存の `lib/growth-data.ts` / `lib/ranking.ts` / `lib/events.ts` を流用する。月単位の集計ができないデータは、無理に作らずセクションを省略してよい。省略したものは完了報告に書く。
  - **完了条件**:
    - `npm run build` が成功する。
    - `/reports/2026-11` が 200 で、文章（「〜人増え」など）と VTuber 名へのリンクが HTML に含まれる。

- [x] **ADS-8. 掲示板の不適切な投稿を表示しない仕組み**
  - **対象ファイル**: `lib/chat.ts`、`components/ChatBoard.tsx`、`lib/ngWords.ts`（新規）
  - **仕様**:
    - `lib/ngWords.ts` に NG ワードの配列を置く。初期値は、一般的な誹謗中傷・差別・性的表現の語と、電話番号・メールアドレス・URL の正規表現。
    - **投稿時**: NG ワードを含む投稿は送信せず、「不適切な表現が含まれているため投稿できません」と表示する。
    - **表示時**: 既存の投稿に NG ワードが含まれる場合は、本文を `この投稿は表示されません` に置き換える（Firestore のデータは変更しない）。
    - 各投稿に「通報」リンクを付ける。`/contact` の「掲示板の投稿の通報」と同じ `mailto:` で、件名にスレッド名とレス番号を入れる。
    - 範囲外: サーバー側での削除（Firestore ルールで delete 不可のため、必要なら管理画面側で別途対応する）。
  - **完了条件**:
    - `npm run build` が成功する。
    - NG ワードを含む投稿は送信できず、表示もされない。通報リンクから件名入りのメール作成画面が開く。

- [x] **ADS-9. AdSense のサイト確認コードと `ads.txt` を設置する（審査リクエスト用）**（🚨2026-11-22 着手可・P0-SEC の次、他の未完了タスクより先に着手）
  - **背景**: ユーザーが AdSense にサイト `vchannel.net` を追加した。審査をリクエストするには、サイトの所有権を確認するコードを本番に置く必要がある。
  - **パブリッシャー ID**: **`ca-pub-1929244717899448`**（公開値。秘密情報ではない）
  - **対象ファイル**: `lib/site.ts`、`app/layout.tsx`、`public/ads.txt`（新規）
  - **仕様**:
    - `lib/site.ts` に `ADSENSE_CLIENT_ID = "ca-pub-1929244717899448"` を追加する。
    - `app/layout.tsx` の `metadata` に `other: { "google-adsense-account": ADSENSE_CLIENT_ID }` を追加する。既存の `verification`（Google Search Console）などは消さない。結果として `<meta name="google-adsense-account" content="ca-pub-1929244717899448">` が全ページの `<head>` に出ること。
    - `public/ads.txt` を作り、内容は次の 1 行（末尾に改行）にする。
      ```
      google.com, pub-1929244717899448, DIRECT, f08c47fec0942fa0
      ```
    - **広告のスクリプト（`adsbygoogle.js`）と広告枠は、このタスクでは入れない**（ADS-10 で合格後に扱う）。
    - `/admin` 配下にも meta が出ることは問題ない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 本番で `curl -s https://www.vchannel.net/ | grep google-adsense-account` に `ca-pub-1929244717899448` が含まれる。
    - 本番で `curl -s https://www.vchannel.net/ads.txt` と `curl -sL https://vchannel.net/ads.txt` が、どちらも上記の 1 行を返す（`text/plain`、200）。
    - 完了報告に「AdSense で『審査をリクエスト』を押してください」と添える。

- ⏸ **ADS-10. AdSense の広告スクリプトと広告枠の設置** — **人手待ち（チェックボックスなし＝着手禁止）**
  - **前提（人手作業）**: AdSense の審査に合格したら、ユーザーが PM に伝える。PM が広告枠の位置を決めてこのタスクに書き込み、行頭を `- [ ]` に変えた時点で着手可能になる。
  - 予定している内容:
    - `layout.tsx` への AdSense スクリプトの追加（`next/script`、`afterInteractive`、`client=ca-pub-1929244717899448`）。
    - 広告枠の位置（記事本文の下、ランキングの下など）。**掲示板には置かない**。
    - プライバシーポリシーの「予定を含む」の表現の見直し。

### P0-CTR: 検索結果からのクリック率を上げる（2026-11-20 追加・P0-SEC の次に着手）

> **背景（2026-11-20 Search Console・過去 7 日）**: 表示回数は 962 回まで増えた（11/13 の 0 回から、11/16〜17 は 1 日 300 回台）。一方でクリックは 15 回、CTR は 1.6% と低い。表示の大半は VTuber 詳細ページで、クエリは VTuber 名。
> - 名前の検索で 9〜12 位（1 ページ目の下〜2 ページ目）に出ているのに、クリックされていない。例: 「瑠璃野ねも」表示 84 回・11 位・クリック 1、「壱百満天原サロメ」表示 26 回・11.8 位・クリック 0。
> - チャンネル名そのままの検索（「miko ch. さくらみこ」12 位）より、名前だけの検索（「さくらみこ」45 位）のほうが順位が低い。title が「Miko Ch. さくらみこの登録者数・配信情報」のようにチャンネル名そのままなのが一因と考えられる。
> - 「〇〇 デビュー日」「〇〇 誕生日」「〇〇 登録者数」「〇〇 年齢」といった、知りたい情報付きの検索がある。今の title / description には誕生日・デビュー日が入っていない。
> - 日付別イベントページは 1〜5 位と上位に出やすい（例: 「10月10日 誕生日 vtuber」1 位）。

- [x] **CTR-1. VTuber 詳細ページの title・description・見出しを「名前＋知りたい情報」にする**
  - **対象ファイル**:
    `lib/vtuberName.ts`（新規）
    `app/vtuber/[channelId]/page.tsx`
    （参照のみ: `lib/admin/xPosts.ts` の `displayName`。**このファイルは編集しない**。AGENTS.md の管理画面の例外のため）
  - **仕様**:
    - `lib/vtuberName.ts` に `displayVtuberName(raw: string): string` を作る。
      - ロジックは `lib/admin/xPosts.ts` の `displayName` と同じ規則にする（コピーでよい）。
      - 例: `Miko Ch. さくらみこ` → `さくらみこ`、`壱百満天原サロメ / Hyakumantenbara Salome` → `壱百満天原サロメ`、`不破 湊 / Fuwa Minato【にじさんじ】` → `不破 湊`、`Kuzuha Channel` → `Kuzuha`。
      - 単体テスト（既存のテスト方式に合わせる）で、上記を含む 10 例以上を確認する。
      - 管理画面側を共通関数に切り替えるのは PM（Claude）が別途行う。
    - **title**: `{表示名}の登録者数・誕生日・デビュー日｜{事務所}`
      - 誕生日がなければ「誕生日・」を外す。デビュー日がなければ「・デビュー日」を外す。
      - 事務所が空、または `個人` の場合は `｜個人勢VTuber` にする。
      - テンプレートで `| Vちゃんねる` が付く。全体が長すぎる場合は、事務所の部分を省いてよい。
    - **description**（120 字前後、数値を先に）: `{表示名}（{チャンネル名}）は{事務所}所属のVTuber。YouTube登録者数{約X万人}（{日付}時点）、誕生日{M月D日}、デビュー日{YYYY年M月D日}。登録者数の推移や最新動画、関連VTuberをまとめています。`
      - 値のない項目は文ごと省く。
    - **h1**: `{表示名}` にする。チャンネル名が表示名と違う場合は、その下に小さく `YouTube: {チャンネル名}` を表示する（チャンネル名での検索にも引き続き合うように）。
    - **JSON-LD**: `Person.name` を表示名、`Person.alternateName` をチャンネル名（表示名と同じなら付けない）にする。誕生日がある場合は `birthDate` は付けない（年がないため）。代わりに本文の「よくある質問」に誕生日の Q&A があることを確認する（IDX-1 で追加済みのはず）。
    - OGP の title も同じ title にそろえる。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 以下 3 件で、`<title>` に表示名（チャンネル名の装飾なし）と「誕生日」「デビュー日」の語が含まれる。
      - `/vtuber/UC-hM6YJuNYVAmUWxeIr9FeA`（さくらみこ）
      - `/vtuber/UCgIfLpQvelloDi8I0Ycbwpg`（壱百満天原サロメ）
      - `/vtuber/UCnbNzG6tecF6BAdhuv_Tipg`（瑠璃野ねも）
    - `FRONTEND_SPEC.md` の 6.1（SEO / AIO 方針）に、詳細ページの title・description の型を追記している。

### P0-NAV: タップしたらすぐ画面を切り替える（2026-11-14 追加・P0-DOMAIN の次、P0-FILTER より先に着手）

> **背景**: 全体的に、タップしてから別のページに切り替わるまでが遅い。特に初回（キャッシュが温まる前）が顕著。原因は、サーバーでデータを読むページに `loading.tsx` も `<Suspense>` も無く、さらに `instant = false` で即時遷移の検証を外しているため、遷移先の描画が終わるまで前の画面に留まっていること。詳細は `FRONTEND_SPEC.md` 6.2。

- [x] **NAV-1. データを読む各ルートに `loading.tsx` を置き、タップ直後にスケルトンへ切り替える**
  - **対象ファイル**: 新規 `components/PageSkeleton.tsx`、新規 `app/loading.tsx`・`app/vtuber/loading.tsx`・`app/vtuber/[channelId]/loading.tsx`・`app/ranking/loading.tsx`・`app/events/loading.tsx`・`app/events/[date]/loading.tsx`・`app/news/loading.tsx`、`instant = false` を書いている各 `page.tsx`
  - **仕様**:
    - `PageSkeleton` は Server Component。`variant`（`"list"` = 行の並び / `"grid"` = カードの並び / `"detail"` = アバター＋見出し＋本文）を受け取り、`animate-pulse` の灰色ブロック（`bg-zinc-200 dark:bg-zinc-800`、角丸）で形だけを出す。外側の `<main>` の幅・余白は各ページと同じクラス（例: `mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8`）にそろえ、読み込み後にレイアウトがずれないようにする。`aria-busy="true"` と画面読み上げ用の「読み込み中」テキスト（`sr-only`）を付ける。
    - 各 `loading.tsx` は `PageSkeleton` を返すだけにする。variant の割り当て: `/`・`/news`・`/events/[date]` = list、`/vtuber`・`/ranking` = grid（ランキングは list でも可。実際の見た目に近い方）、`/vtuber/[channelId]` = detail、`/events` = grid。
    - `app/loading.tsx` は `/admin` 配下にも効くが、管理画面は対象外のため触らない（`app/admin/` に何も追加しない）。
    - `/vtuber/[channelId]`・`/ranking`・`/events`・`/events/[date]` の `export const instant = false` を削除する。削除で `npm run build` が失敗する（静的シェルの検証エラー）ページだけは残し、理由をコメントで書く。
    - ページ本体のデータ取得・表示内容・`generateMetadata` は変えない。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - `npm run build && npm start` で、キャッシュの無い状態（サーバー再起動直後）から下部ナビ・ヘッダー・一覧→詳細をタップすると、**押した直後に URL と画面がスケルトンへ切り替わり**、その後に中身が出る。
    - `curl -s http://localhost:3000/vtuber/{channelId}` の HTML に、従来どおり JSON-LD と同じ事務所のメンバーへのリンクが含まれる。
    - `FRONTEND_SPEC.md` 6.2 に `PageSkeleton` の props と variant の割り当てを追記する。

- [x] **NAV-2. ナビのリンクに押下中の表示を出す**（NAV-1 の後に着手）
  - **対象ファイル**: `components/BottomNav.tsx`、`components/AppShell.tsx`（ヘッダーのお気に入り・イベント・設定リンク）
  - **仕様**:
    - `next/link` の `useLinkStatus()` を使う小さな Client Component（例: `components/LinkPendingIndicator.tsx`）を作り、各 `<Link>` の子に置く。`pending` の間、アイコンを薄くする（`opacity-60`）か、項目の下に細いバーを出す。遷移が速いときにちらつかないよう、表示は 100ms 遅らせる（CSS の `transition-delay` か `animation-delay` で）。
    - 押した項目は、遷移完了を待たずに選択中の見た目（現行のアクティブ色）にする。
    - 既存のリンク先・アイコン・ラベルは変えない。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - 本番ビルドで、遅いネットワーク（DevTools の Slow 4G）でナビを押すと、押した直後に押下中の表示が出る。
    - `FRONTEND_SPEC.md` 5.0 アプリシェルに押下中表示のルールを追記する。

### P0-FILTER: 事務所フィルターの初期状態と「空 = すべて」の統一（2026-11-11 追加・P0-CHAT の次に着手）

> **背景**: `selectedChannelIds` が空のとき、配信とランキングは全件を表示するのに、VTuber タブは何も表示しない。掲示板は 1 人でも選ぶと、選んだ事務所のスレッドだけに絞られる。フィルター画面では全件が表示されているのにチェックが全部外れて見えるため、状態がわかりにくい。
>
> **方針**: 保存値は「空 = すべて（絞り込みなし）」のまま変えない。**全 ID を localStorage に保存しない**こと。自動登録（仕様 2.3.1）で毎日 VTuber や事務所が増えるため、全 ID を保存すると新しく増えた分がフィルターから漏れる。UI 側で「空 = 全部チェック済み」に見せる。

- [x] **FILTER-1. 掲示板はフィルターに関係なく全スレッドを表示する**
  - **対象ファイル**: `components/ChatBoard.tsx`
  - **仕様**:
    - `tabs` は常に全スレッドを出す。並び順は以下のとおり。
      1. 選択中のチャンネルを含む事務所のスレッド（`offices` の順）
      2. 残りのスレッド（`lastUpdated` の新しい順）
    - 選択が空なら、全スレッドを `lastUpdated` の新しい順に並べる（現行どおり）。
    - 1 のスレッドのタブには、名前の前に lucide-react の `Star`（`size={12}`、塗りつぶし）を付けて区別する。
    - 初期タブは先頭のスレッドにする（現行どおり）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - フィルターで 1 人だけ選んでも、掲示板に全事務所のスレッドが表示され、選んだ事務所のスレッドが先頭に ★ 付きで出る。
    - `FRONTEND_SPEC.md` 5.6（PM 更新済み）の記述と実装が一致している。

- [x] **FILTER-2. 🚨 不具合: フィルターを「すべて表示」にすると VTuber タブに何も出ない**（2026-11-14 改訂・最優先。DOMAIN-1 より先に着手）
  - **症状**: フィルターで `すべて表示` を押すと（＝保存値が空）、`/vtuber` のタブ一覧が `Vtuberリストがありません（フィルターで事務所を選択してください）` だけになる。
  - **原因**: FILTER-3 で「全選択は空として保存する（空 = すべて）」に変えたが、`components/VTuberTabs.tsx` だけが「空 = 何も選んでいない」のままで、`index.items.filter((m) => sel.has(m.channelId))` で 0 人になる。配信・ランキング・急上昇 TOP3 は `channelIds.length === 0` なら全件にしているので正しく出る。
  - **方針の変更**: 旧仕様の「空なら案内カードを出す」は取りやめる。VT-GROUP-1/2 で事務所ごとの折りたたみ・事務所チップができたので、全員（約 1,400 人）を出しても一覧が長くなりすぎない。フィルター画面で「すべて表示」が全チェックに見えている以上、VTuber タブも全員を出すのが自然。
  - **対象ファイル**: `components/VTuberTabs.tsx`
  - **仕様**:
    - 「選択中かどうか」の判定を 1 つの関数にまとめる（例: `const isInSelection = (id) => channelIds.length === 0 || sel.has(id)`）。`sel.has(...)` を直接使っている次の箇所をすべてこれに置き換える。
      - `members` の絞り込み（空なら `index.items` 全件）
      - `searchPinned` を外す判定、検索結果を選んだときの判定
      - 検索結果の `選択外` バッジ（空のときに全員に `選択外` が付く不具合も同時に直る）
      - タブ一覧の `検索から表示中` ラベル
    - 空のときの表示:
      - PC（VT-GROUP-1）: 全事務所の見出しを出し、表示中の VTuber の事務所だけ開く（現行の動き）。閉じた事務所のメンバーは描画しない（現行どおり）。
      - スマホ（VT-GROUP-2）: 事務所チップの `すべて` を**出さない**（1,400 個のチップが並ぶのを避ける）。初期の事務所チップは表示中の VTuber の事務所。
      - 初期表示の VTuber は `members[0]`（事務所の初出順の先頭）のままでよい。
    - `Vtuberリストがありません（フィルターで事務所を選択してください）` は「選択があるのに該当 0 人」のときだけ出す。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - localStorage を空にして `/vtuber` を開くと、PC は事務所の折りたたみ、スマホは事務所チップ＋メンバーチップで全事務所が出る。
    - フィルターで `すべて表示` を押すと同じ表示になる。事務所を 1 つ選ぶと、その事務所だけになる（現行どおり）。
    - 選択が空のとき、VTuber 検索の結果に `選択外` バッジが付かない。
    - `FRONTEND_SPEC.md` 5.4（PM 更新済み）の記述と実装が一致している。

- [x] **FILTER-8. フィルターの VTuber チップで、「すべて表示」のときにチェックマークが消えている**（FILTER-2 の次に着手）
  - **症状**: `すべて表示` の状態でフィルターの事務所を開くと、VTuber チップの背景は選択色なのに、右端の ✓ だけ灰色（未選択の見た目）になる。
  - **原因**: `components/OfficeSelector.tsx` のチップの ✓ の色だけが `sel.has(m.channelId)` を見ている。背景と `aria-checked` は `isSelected(m.channelId)`（空 = すべて対応済み）を使っている。
  - **対象ファイル**: `components/OfficeSelector.tsx`
  - **仕様**: ✓ の色の判定を `isSelected(m.channelId)` に変える。ほかに `sel.has` を直接使っている箇所が無いか確認し、表示用の判定はすべて `isSelected` にそろえる。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - localStorage を空にしてフィルターを開き、事務所を展開すると全チップに紫の ✓ が付いている。

- [x] **FILTER-9. 旧 UI の「全選択」で全 ID が保存されたままの人を「すべて表示」に戻す**（FILTER-8 の次に着手）
  - **症状**: FILTER-3 より前の `全選択` ボタンを押した人は、localStorage の `selectedChannelIds` に当時の全 ID（約 1,400 件）が残っている。この人は、ヘッダーに `絞り込み中 1400人` のチップが出続け、そのあと自動登録で増えた VTuber が配信・ランキング・VTuber タブに出ない。
  - **原因**: 「全員 = 空」への正規化は保存するとき（`setChannelIds(next, allIds)`）にしか行われない。読み込み時は正規化しないため、古い値が残る。しかも VTuber が増えると「全 ID と完全一致」しなくなるので、今のままの判定では二度と空に戻らない。
  - **対象ファイル**: `hooks/useSelection.ts`, `components/AppShell.tsx`
  - **仕様**:
    - `useSelection.ts` に `migrateLegacyFullSelection(allIds: readonly string[])` を追加する。`AppShell`（`offices` から全 ID を作れる場所）でマウント時に 1 回呼ぶ。
    - 処理: localStorage の `selectionMigratedV1` が `"1"` なら何もしない。そうでなければ、保存中の ID のうち現在も存在するものが**全 ID の 95% 以上**なら `resetSelection()` する。最後に、結果に関係なく `selectionMigratedV1 = "1"` を書く（1 回だけ実行。以降に自分で選んだ大きな選択を勝手に消さないため）。
    - 95% の理由: 旧「全選択」の後に VTuber が増えても一致とみなすため。数十人だけ外した選択も「すべて」に戻るが、旧 UI でそれをしている人はほぼいない想定（PM 判断）。
    - localStorage の読み書きは try/catch で囲む（使えない環境では何もしない）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - DevTools で `selectedChannelIds` に全 ID の配列を入れ、`selectionMigratedV1` を消してリロードすると、絞り込み中チップが消えて全件表示になる。
    - 1 事務所だけ選んだ状態では、リロードしても選択が残る。
    - `FRONTEND_SPEC.md` 4 章（PM 更新済み）の記述と実装が一致している。

- [x] **VDIR-1. 「事務所別VTuber一覧」を事務所ごとの折りたたみに変える（見た目の改善・SEO は維持）**
  - **対象ファイル**: `components/VTuberDirectory.tsx`
  - **⚠ 2026-11-12 PM 追記（やり直し）**: PR #17（`fc582bd`）で見た目は仕様どおりになったが、メンバーのリンクを JSX の `<Link>` で描画したため、`/vtuber` の HTML が **758KB → 1,578KB（+108%）**、RSC ペイロードが 443KB → 925KB に増え、完了条件（+10% 以内）を満たしていない。**見た目（`<details>` / `<summary>` / `<h2>` / チップ）は現行の PR #17 のまま**、メンバー一覧の出力を PR #17 以前と同じ「`escapeHtml` した HTML 文字列を `dangerouslySetInnerHTML` で出す」方式に戻すこと（`<Link>` は使わず `<a href>` の文字列にする）。確認は `npm run build` 後の `.next/server/app/vtuber.html` のサイズで行い、830KB 以下を目安とする。
  - **背景**: 現状はタブ UI の下に全員分の青いテキストリンクが並び、見た目が悪い。SEO/AIO のため、リンクは初期 HTML に残す必要がある。
  - **仕様**:
    - セクション見出しを `事務所から探す` に変える（`<h2>` 相当の大きさ。ページの h1 はそのまま）。
    - 事務所ごとに `<details>` で包み、**初期状態は閉じる**。`<summary>` の中に `<h2>` を置き、`事務所名` と人数（例: `85人`）、右端に開閉の矢印（lucide-react の `ChevronDown` 相当。開いたら回転）を表示する。
    - 開いた中身は、メンバーへの `<a href="/vtuber/{channelId}">` を丸みの強いチップ（`rounded-full`、枠線、名前＋小さめの登録者数）で `flex-wrap` に並べる。サイドメニューの VTuber チップと揃えたトーン（ホバーで violet 系）にする。画像は付けない。
    - 事務所の並びは現行どおり。各事務所の行は区切り線付きのリストにする。
    - **リンクを CSS で隠さない**（`display:none`、`sr-only`、`hidden` 属性は不可）。閉じた `<details>` の中身として HTML に出すだけにする。
    - RSC ペイロードの肥大化を避けるため、現行どおり HTML 文字列を `dangerouslySetInnerHTML` で出す方式を維持してよい（`escapeHtml` も維持）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - `/vtuber` の初期 HTML に全メンバーの `<a href="/vtuber/...">` と事務所ごとの `<h2>` が含まれる。
    - 初期表示では事務所名の行だけが見え、タップで開閉できる。
    - `/vtuber` の HTML サイズが現行から大きく増えていない（目安: +10% 以内）。
    - `FRONTEND_SPEC.md` 5.4（PM 更新済み）の記述と実装が一致している。

- [x] **FILTER-3. フィルター画面で「空 = すべて表示中」を全チェック状態として見せる**
  - **対象ファイル**: `components/OfficeSelector.tsx`, `hooks/useSelection.ts`
  - **仕様**:
    - 検索欄の下にある `全選択` / `選択解除` の 2 ボタンをやめて、事務所リストの先頭に `すべて表示` 行を置く（事務所行と同じ丸のチェック付き）。
      - 選択が空のときは `すべて表示` を「全選択」の見た目にし、全事務所の丸と全 VTuber チップもチェック済みの見た目にする（保存値は空のまま）。
      - 選択があるときに `すべて表示` をタップすると、選択を空に戻す（`onChange([])`）。
    - 「すべて表示」の状態で事務所の丸をタップしたら、**その事務所のメンバーだけ**の選択にする。VTuber チップをタップしたら、その 1 人だけの選択にする。
      - `すべて表示` 行の下に、補足を小さく出す: `事務所やVTuberをタップすると、そこだけに絞り込みます`（選択が空のときだけ）。
    - 選択があるときのトグル動作は現行どおり。最後の 1 人を外して空になったら、「すべて表示」に戻る（保存値が空なので自然にそうなる）。
    - 選択が全チャンネル ID と一致したら空に正規化して保存する（`全選択` で全 ID を保存しない）。
    - 検索中は `すべて表示` 行を出さなくてよい。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - localStorage が空の状態でフィルターを開くと、全事務所にチェックが付いて見える。
    - その状態で事務所を 1 つタップすると、その事務所だけに絞られ、配信・ランキング・VTuber タブに反映される。
    - localStorage の `selectedChannelIds` に全 ID が保存されることがない。
    - `FRONTEND_SPEC.md` 4 章と 5.1（PM 更新済み）の記述と実装が一致している。

- [x] **FILTER-5. フィルターの VTuber チップで、名前が長いと右端のチェックマークが潰れる不具合を直す**（2026-11-14 実装）
  - **対象ファイル**: `components/OfficeSelector.tsx`
  - **原因**: 右端のチェック丸（`ml-auto flex size-5 ...`）に `shrink-0` が無い。名前の `truncate` と横幅を取り合い、名前が `…` で省略されるチップではチェック丸の横幅が縮んで楕円や見切れになる。
  - **仕様**:
    - 右端のチェック丸に `shrink-0` を付ける。
    - 名前の `<span className="truncate">` に `min-w-0 flex-1` を付ける（チェック丸は `ml-auto` が無くても右端にそろう）。
    - 長い名前の `title` 属性にフルネームを入れ、省略されても長押しやホバーで読めるようにする。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - スマホ幅（360px）で名前が `…` になるチップでも、チェック丸がほかのチップと同じ真円・同じ位置で表示される。

- [x] **FILTER-6. フィルターの VTuber チップのアイコンを、名前の頭文字からチャンネルのサムネイルにする**（2026-11-14 実装）
  - **対象ファイル**: `lib/offices.ts`, 新規 `app/api/office-thumbnails/route.ts`, `components/OfficeSelector.tsx`
  - **前提（2026-11-14 計測）**: 事務所 24、VTuber 1,408 人。`channelThumbnail` は 1 件約 120 文字で、全件だと約 170KB になる。`offices` は `app/layout.tsx` から **全ページの HTML に埋め込まれる**ので、`OfficeSummary` にサムネイル URL を足してはいけない（P0-PERF の「HTML 500KB 以下」目標に反する）。また URL の末尾は `=s800-...`（800px）なので、そのまま 24px のアイコンに使うと画像が重い。
  - **仕様**:
    - **サムネイルは別 JSON で、フィルターを開いたときに取得する**。
      - `app/api/office-thumbnails/route.ts`（GET）を追加し、`{ [channelId]: string }` を返す。`lib/offices.ts` に `getOfficeThumbnails()` を追加し、`getOfficeSummaries()` と同じく `"use cache"` + `cacheLife("hours")` でキャッシュする。
      - 値は容量を減らすため短縮形にする: 先頭の `https://yt3.ggpht.com/` を除き、末尾の `=s...` 以降も除いた部分だけを返す。`yt3.ggpht.com` 以外のホストの URL はそのまま返す。
      - レスポンスに `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` を付ける。
    - `OfficeSelector` はマウント時（フィルターを開いたとき）に 1 回だけ `fetch("/api/office-thumbnails")` する。結果はモジュール変数に保持し、2 回目以降に開いたときは再取得しない。
    - 画像 URL は短縮形を戻して `https://yt3.ggpht.com/<短縮形>=s48-c-k-c0x00ffffff-no-rj` にする（**48px**。Retina で 24px 表示に十分）。
    - アイコンは既存の `SafeImage`（`variant="avatar"`、`loading="lazy"`、`className="size-6 shrink-0 rounded-full object-cover"`）で表示する。
      - 取得前・取得失敗・URL なしのときは、今の頭文字の丸をそのまま出す（レイアウトが動かないよう同じ `size-6`）。
      - 選択中は、アイコンに `ring-2 ring-white`（ダークは `dark:ring-zinc-900`）を付けて、グラデーション背景から浮かせる。
    - 画像は事務所を展開したときだけ描画される（今の `open &&` のまま）。`loading="lazy"` と合わせて、スクロールして見えた分だけ読み込まれる。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - `/` など各ページの HTML サイズが、この変更の前後で増えていない（サムネイル URL が HTML に入っていない）。
    - フィルターを開いて事務所を展開すると、各チップにチャンネルのアイコンが出る。DevTools の Network で画像 URL が `=s48` になっている。
    - `/api/office-thumbnails` のレスポンスが gzip 後おおよそ 100KB 以下。
    - `FRONTEND_SPEC.md` 5.1（PM 更新済み）の記述と実装が一致している。

- [x] **FILTER-7. フィルターの事務所名の左に、事務所のアイコン（公式チャンネルのサムネイル）を出す**（2026-11-14 追加・FILTER-6 の次に着手）
  - **対象ファイル**: `lib/offices.ts`, `components/OfficeSelector.tsx`
  - **前提（2026-11-14 計測）**: 24 事務所のうち 19 事務所に、公式アカウント（`officeFlg: true`）が 1 人いる。いない事務所は `KAMITSUBAKI` / `Phase Connect` / `Crazy Raccoon` / `REJECT` / `個人`。
  - **仕様**:
    - `OfficeSummary` に `thumbnail?: string` を追加する。`summarizeOffices()` で、その事務所の `officeFlg: true` のメンバーの `channelThumbnail` を入れる（いなければ入れない）。
      - 事務所は 24 件だけなので、FILTER-6 と違って **`OfficeSummary` に直接入れてよい**（HTML 増加は約 3KB）。容量を抑えるため、FILTER-6 と同じ短縮形（`https://yt3.ggpht.com/` と `=s...` 以降を除く）で持たせる。短縮・復元の処理は FILTER-6 と共通の関数にする（例: `lib/thumbnail.ts` の `shortenYtThumb()` / `ytThumbUrl(short, size)`）。
    - 事務所行の、左の選択丸と事務所名のあいだにアイコンを置く。`SafeImage`（`=s48`、`className="size-6 shrink-0 rounded-full object-cover"`、`loading="lazy"`）で表示する。
      - `thumbnail` が無い事務所は、lucide-react の `Building2` を同じ `size-6` の灰色の丸の中に出す。`個人` だけは `User` を出す。
    - 左の選択丸（チェック状態）と見分けがつくように、アイコンは選択状態で色を変えない。
    - 事務所名が長いときは `truncate` で省略し、右端の `▲/▼` を縮めない（`shrink-0`）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - フィルターを開いた直後（事務所を展開しなくても）、公式アカウントがある事務所の名前の左にアイコンが出る。
    - 公式アカウントが無い事務所は `Building2`、`個人` は `User` のアイコンになる。
    - `FRONTEND_SPEC.md` 5.1（PM 更新済み）の記述と実装が一致している。

### P0-VTFIND: VTuber タブで目当ての子を探しやすくする（2026-11-14 追加・FILTER-7 の次に着手）

> **背景**: VTuber タブの左の一覧は、フィルターで選んだ人を事務所の順に区切りなしで 1 列に並べているだけなので、人数が多いと目で追うしかない。また、選んでいない子はフィルター画面に戻らないと見られない。スマホは横スクロール 1 列なのでさらに探しにくい。
>
> **前提**: `initialIndex`（`tabItems`）には全 1,408 人分の `channelId` と `name` がすでに入っている。検索のために追加の取得や HTML の増加は不要。FILTER-2（案内カード）の実装後に着手すること。

- [x] **VT-SEARCH-1. VTuber タブに名前検索を付ける（フィルターの選択外の人も対象）**（2026-11-14 実装）
  - **対象ファイル**: `components/VTuberTabs.tsx`、新規 `lib/search.ts`、`components/OfficeSelector.tsx`（正規化関数の共通化のみ）、`lib/server-data.ts`、`app/vtuber/page.tsx`、`components/VTuberTabsIsland.tsx`
  - **仕様**:
    - `lib/search.ts` に `normalizeForSearch(s: string): string` を追加する。処理は NFKC → 小文字化 → ひらがなをカタカナへ（`ぁ-ゖ` に `+0x60`）→ 空白と `・` を除去。
      - `OfficeSelector` の検索（今は `toLowerCase().includes`）もこの関数に置き換える。
    - タブ一覧の上に検索欄を置く。
      - `type="search"`、左に lucide-react の `Search`（`size={16}`）、placeholder `VTuber名で探す`、`aria-label="VTuber名で探す"`。
      - PC（`lg` 以上）では左カラムの先頭に置き、一覧と一緒に sticky にする。スマホではタブ列の上に全幅で置く。
    - 検索対象は**フィルターの選択に関係なく全件**（`index.items`）。名前を正規化して部分一致で照合する。照合は `useMemo` で行い、正規化済みの名前は index ごとに 1 回だけ作る。
    - 入力が空でないあいだは、タブ一覧の代わりに結果リストを出す。
      - 縦並びで、各行は名前と事務所名（小さく灰色）。PC は左カラム内でスクロール、スマホは最大高さ `max-h-80` でスクロール。
      - 表示は最大 50 件。超えた分は末尾に `ほか N 人（名前をもう少し入力してください）` と表示する。0 件なら `該当するVTuberが見つかりません`。
      - フィルターで選んでいない人の行には、右端に小さな `選択外` バッジ（灰色の枠線）を付ける。
      - 事務所名は VT-GROUP-1 の `officeGroups` から引く。VT-GROUP-1 より先に実装する場合は、`officeGroups` の受け渡し（下記）だけ先に入れてよい。
    - 結果の行をタップしたら、検索欄を空にして、その人を `active` にする。
      - 選択内の人なら、そのタブを選んだ状態にする（スクロールして見える位置に出す。`scrollIntoView({ block: "nearest" })`）。
      - 選択外の人なら、タブ一覧の先頭に 1 行だけ一時的に足して選択状態にする。行の上に小さく `検索から表示中` と表示する。ほかのタブを選んだら、この行は消える。
      - 現在の `currentId` は `members` にいない `active` を無視している。選択外の人の `active` も詳細表示に使えるように直すこと。
    - 選択が空（FILTER-2 の案内カードの状態）でも検索欄を出す。結果を選んだら、案内カードの代わりにその人の詳細（`Detail`）を表示する。その場合は左カラムを使わず、全幅で表示する。
    - `Esc` キーで検索欄を空にする。結果リストは上下キーでも選べるとよい（必須ではない）。
    - `officeGroups` の受け渡し: `getCachedVTuberPageData()` で `officeGroups: { name: string; count: number }[]` を作る。`tabItems` は事務所ごとに連続した並び（事務所の初出順、事務所内は今の順）にそろえ、`officeGroups` はその並びの区切りにする。`app/vtuber/page.tsx` → `VTuberTabsIsland` → `VTuberTabs` に `initialOfficeGroups` として渡す。`/api/vtuber` から取得した場合は、各行の `office` から同じ形を組み立てる。`tabItems` の各行に事務所名は**足さない**。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - `.next/server/app/vtuber.html` のサイズが変更前から +5KB 以内。
    - フィルターでホロライブだけを選んだ状態で、にじさんじのメンバー名を入力すると `選択外` 付きで出る。タップすると詳細が表示される。
    - 「ぺこら」と「ペコラ」のどちらでも同じ人がヒットする。
    - localStorage が空の状態でも、検索から詳細を表示できる。
    - `FRONTEND_SPEC.md` 5.4（PM 更新済み）の記述と実装が一致している。

- [x] **VT-GROUP-1. PC の左の一覧を事務所ごとの折りたたみにする**（2026-11-14 実装）
  - **対象ファイル**: `components/VTuberTabs.tsx`、`components/Skeleton.tsx`（必要なら）
  - **仕様**（`lg` 以上のみ。スマホは VT-GROUP-2）:
    - `members` を `officeGroups` で事務所ごとに分け、事務所ごとに見出しボタンを置く。
      - 見出し行は、事務所名（`truncate`）・人数（`12人`、`tabular-nums`、灰色）・右端の lucide-react の `ChevronDown`（`size={16}`、`shrink-0`、開いているときは `rotate-180`）。
      - `aria-expanded` と `aria-controls` を付ける。見出しはフィルター画面の事務所行と同じトーン（太字、薄い区切り線）にする。
    - 最初は、表示中の VTuber がいる事務所だけを開く。手で開閉した状態は `useState<Set<string>>` で持ち、タブを切り替えても勝手に閉じない。保存はしない。
    - 選択中のメンバーが 1 事務所だけなら、見出しを出さずに従来どおりのフラットな一覧にする。
    - 閉じた事務所のメンバーは DOM に描画しない（タブの `role="tab"` は開いている分だけになる）。
    - VT-SEARCH-1 の `検索から表示中` の行は、事務所の見出しより上に置く。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - PC 幅で 3 事務所以上を選ぶと、表示中の事務所だけが開いた状態で一覧が出て、見出しのタップで開閉できる。
    - 1 事務所だけを選んだ場合は、従来と同じ見た目になる。
    - スマホ幅の見た目は変わらない（VT-GROUP-2 で変える）。
    - `FRONTEND_SPEC.md` 5.4（PM 更新済み）の記述と実装が一致している。

- [x] **VT-GROUP-2. スマホのタブ列を「事務所チップ＋メンバーチップ」の 2 段にする**（2026-11-14 実装）
  - **対象ファイル**: `components/VTuberTabs.tsx`
  - **仕様**（`lg` 未満のみ）:
    - 選択中のメンバーが 2 事務所以上にまたがるときは、メンバーのタブ列の上に事務所チップの列を 1 段足す。
      - 事務所チップは横スクロールで、先頭に `すべて`、続けて事務所名と人数（例: `ホロライブ 12`）を並べる。
      - 見た目はメンバーチップより一回り小さくする（`text-xs`、枠線のみ、選択中は violet 系の塗り）。
    - 事務所チップを選ぶと、2 段目をその事務所のメンバーだけにする。`すべて` なら従来どおり全員を出す。
    - 初期の事務所チップは、表示中の VTuber の事務所にする。事務所チップを切り替えても詳細の表示は変えない。2 段目の先頭のタブを自動で選ぶことはしない。
    - 1 事務所だけなら 1 段目は出さない。
    - PC（`lg` 以上）では 1 段目を出さない（`lg:hidden`）。VT-GROUP-1 の折りたたみと二重にならないようにする。
    - 375px 幅で横にはみ出さないこと（ページ全体の横スクロールを出さない）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - スマホ幅で 3 事務所を選ぶと 2 段のチップになり、事務所チップでメンバー列が切り替わる。
    - `FRONTEND_SPEC.md` 5.4（PM 更新済み）の記述と実装が一致している。

- [x] **VT-PROFILE-1. VTuber 詳細に誕生日とデビュー日（周年）を表示する**（2026-11-14 追加・VT-GROUP-2 の次に着手）
  - **対象ファイル**: 新規 `lib/profile-date.ts`、`lib/server-data.ts`、`types/index.ts`、`components/VTuberTabs.tsx`（`DetailView`）、`app/vtuber/[channelId]/page.tsx`
  - **背景**: `officedataList.json` には `birthday` / `debut` があるが、詳細画面では使っていない。2026-11-14 時点で、公式アカウントを除く 1,389 人のうち誕生日 792 人、デビュー日 790 人に値がある（残りはバックエンドの補完ジョブ（仕様 2.3.2）が順次埋める）。記念日の配信を追うファンにとって知りたい情報で、日付ページ（`/events/{MM-DD}`）への内部リンクも増やせる。
  - **仕様**:
    - **日付の正規化**: `lib/profile-date.ts` に次の 2 関数を追加する。
      - `parseMonthDay(s): { month: number; day: number } | null`: `05-15` / `05/23` / `5/3` / `2018/05/15` / `2018-05-15` を受け付け、最後の 2 つの数字を月・日とする。
      - `parseDebut(s): { year?: number; month: number; day: number } | null`: `2018/3/22` / `2018/09/07` / `2018-09-07` を受け付ける。4 桁の年が無ければ `year` なしで返す。
      - 共通ルール: 区切りは `/`・`-`・`.`・`年月日` を許す。月 1〜12、日がその月の範囲内（2/29 は可）でなければ `null`。空文字・不正値は `null`。
    - **データ**: `VTuberDetail` に `birthday?: { month: number; day: number }` と `debut?: { year?: number; month: number; day: number }` を追加し、`lib/server-data.ts` の詳細の組み立てで上の関数を使って入れる（`null` のときは項目を入れない）。`VTuberIndexItem` / `VTuberTabItem` には足さない（`/vtuber` の HTML を増やさないため）。
    - **表示**（`DetailView`。一覧タブと `/vtuber/[channelId]` の両方に出る）:
      - 数値の `<dl>` の下、登録者数推移のグラフの上に、プロフィール行のまとまりを置く。
      - 誕生日の行: lucide-react の `Cake`（`size={16}`）＋ `誕生日` ＋ `5月15日`。デビューの行: `PartyPopper` ＋ `デビュー` ＋ `2017年9月7日`（年が無ければ `9月7日`）。
      - 日付部分は `<Link href={`/events/${formatDateSlug(month, day)}`}>`（`lib/events.ts` の既存関数）にする。ホバーで violet 系。
      - 値がない行は出さない。両方ないときはまとまりごと出さない（`不明` とは書かない）。
      - 背景のぼかしサムネイルの上でも読めるように、既存の数値カードと同じトーン（半透明の白／ダーク対応）にする。375px 幅で 1 行に収まらない場合は、相対表示を次の行に折り返してよい。
    - **相対表示**（日付の右に小さく）:
      - 新規の小さなクライアントコンポーネント（例: `components/DateCountdown.tsx`）で、**マウント後に** JST の今日（`lib/events.ts` の `todayJstParts()`）を基準に計算する。マウント前は何も描画しない。キャッシュされた HTML と日付がずれても、ハイドレーションの不一致を起こさないようにするため。
      - 誕生日: `あと N 日`。当日は `今日は誕生日！`（amber 系のバッジ）。1〜30 日以内は `もうすぐ` バッジ（violet 系）＋ `あと N 日`。
      - デビュー（年があるとき）: 今年の記念日を過ぎていれば `N周年`。当日は `今日で N周年！`（amber 系のバッジ）。次の記念日まで 30 日以内なら `もうすぐ N周年（あと D 日）`。デビュー日が未来なら `デビューまであと D 日`。周年が 0（今年デビュー済み）なら `今年デビュー`。
      - デビュー（年がないとき）: 誕生日と同じく `あと N 日` だけを出す。
      - 2/29: うるう年でない年は 3 月 1 日として数える。
    - **要約文**: `app/vtuber/[channelId]/page.tsx` の `buildSummary()` の末尾に、ある分だけ `誕生日は5月15日、デビューは2017年9月7日です。` を足す（片方だけなら片方だけの文にする）。`metadataDescription()` と JSON-LD は変えない（誕生日に年が無いので `birthDate` は入れない）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - `/vtuber/UCp6993wxpyDPHUpavwDFqgg`（ときのそら）の HTML に `5月15日`、`2017年9月7日`、`href="/events/05-15"`、`href="/events/09-07"` が含まれる。
    - 誕生日もデビュー日も無い VTuber の詳細では、プロフィール行が出ない。
    - `.next/server/app/vtuber.html` のサイズが変わらない（一覧のデータに項目を足していない）。
    - ブラウザのコンソールにハイドレーションの警告が出ない。
    - `FRONTEND_SPEC.md` 5.4（PM 更新済み）の記述と実装が一致している。

- [x] **FILTER-4. ヘッダーに「絞り込み中」チップを出す**（2026-11-13 PR #18 で実装）
  - **対象ファイル**: `components/AppShell.tsx`
  - **仕様**:
    - 選択が空でないとき、ヘッダーのフィルターボタンの左に小さなチップ `絞り込み中 N人`（N = 選択中のチャンネル数）を表示する。チップ右端の `X`（lucide-react）で `resetSelection()` を呼んで解除する。
    - チップ本体のタップでフィルター（サイドメニュー）を開く。
    - 選択が空のときは出さない。スマホ幅でヘッダーが折り返さないように、狭い画面では `N人` と `X` だけにしてよい。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - 絞り込み中はどのページでもチップが見え、`X` で全件表示に戻る。
    - `FRONTEND_SPEC.md` 5.0（PM 更新済み）の記述と実装が一致している。

- [x] **VT-ICON-1. VTuber タブの名前・事務所名の横にアイコンを出す（フィルターとそろえる）**（2026-11-14 追加・VT-PROFILE-1 の次に着手。FILTER-2 が終わっていること）
  - **背景**: フィルターでは VTuber・事務所にアイコンが付いて見やすくなった（FILTER-6/7）。VTuber タブは文字だけで、見た目がそっけない。タブのボタンには `m.thumbnail` があれば画像を出す処理があるが、`/vtuber` の初期データ（`toVTuberTabItems()`）は HTML を軽くするためにサムネイルを落としているので、実際には一度も出ていない。
  - **方針**: HTML は増やさない。**VTuber のアイコンは、フィルターと同じ `/api/office-thumbnails` をマウント後に 1 回だけ取得して使う**。事務所のアイコンは 24 件だけなので、FILTER-7 と同じ短縮形でサーバーから渡してよい。
  - **対象ファイル**: `components/VTuberTabs.tsx`, `components/OfficeSelector.tsx`, 新規 `hooks/useChannelThumbnails.ts`, `lib/server-data.ts`, `types/index.ts`
  - **仕様**:
    - **取得の共通化**: `OfficeSelector` にあるサムネイル取得（モジュール変数のキャッシュと、取得中のリクエストの共有）を `hooks/useChannelThumbnails.ts` に移し、`useChannelThumbnails(): Record<string, string> | null` として `OfficeSelector` と `VTuberTabs` の両方から使う。フィルターと VTuber タブのどちらを先に開いても、取得は 1 回だけにする。画像 URL は `ytThumbUrl(short, 48)` で作る（FILTER-6 と同じ）。
    - **アイコンを出す場所**:
      | 場所 | アイコン | 大きさ |
      |---|---|---|
      | タブのボタン（PC の縦一覧・スマホのメンバーチップ） | VTuber | `size-7`（今の `img` と同じ） |
      | 検索結果の行（名前＋事務所名の 2 行） | VTuber | `size-8` |
      | PC の事務所見出し（VT-GROUP-1） | 事務所 | `size-5` |
      | スマホの事務所チップ（VT-GROUP-2） | 事務所 | `size-4` |
    - 表示は既存の `SafeImage`（`variant="avatar"`、`loading="lazy"`、`rounded-full object-cover shrink-0`）を使う。取得前・取得失敗・URL なしのときは、同じ大きさで**名前の頭文字の丸**を出す（フィルターと同じ見た目。画像が後から来ても横幅が動かないように）。
    - 選択中のタブ（`bg-blue-600`）では、頭文字の丸を `bg-white/20 text-white` にする。
    - **事務所のアイコン**: `VTuberOfficeGroup` に `thumbnail?: string`（FILTER-7 と同じ短縮形）を足し、`buildOfficeGroups()` で公式チャンネル（`officeFlg`）のサムネイルを入れる。公式チャンネルが無い事務所は、頭文字の丸にする。`/api/vtuber` から組み立てる場合（`buildOfficeGroupsFromIndex`）も同じにする。
    - 事務所名・人数・並び順・開閉の動作は変えない。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - `/vtuber` のタブ・検索結果・事務所見出し（PC）・事務所チップ（スマホ）にアイコンが出る。DevTools で `/api/office-thumbnails` を失敗させても、頭文字の丸が出てレイアウトが崩れない。
    - `/vtuber` の HTML サイズの増加が 5KB 以内（`npm run build` 後の `.next/server/app/vtuber.html` で比べる）。
    - フィルターを開いてから `/vtuber` に移っても、`/api/office-thumbnails` へのリクエストが 2 回目に飛ばない。
    - `FRONTEND_SPEC.md` 5.4（PM 更新済み）の記述と実装が一致している。

---

### 🚨 P0-COST: 巨大 JSON の読み込みをやめて GCS の転送料を下げる（2026-11-22 追加・**最優先。CHAT-6 より先に着手**。COST-1 → COST-9 の順）

> **調査結果（2026-11-22）**: 今月の Firebase 請求 ¥4,175 のうち ¥2,796 が GCS の外部転送（165GB）。原因は Web が `officedataList.json`（約 20MB）と `allvideos.json`（約 18MB）を読んでいること。Next.js の fetch キャッシュは 2MB 超を保持できないため、`lib/server-data.ts` の `memo`（インスタンス内 1 時間）や `lib/stream-data.ts`（5 分ごと）のたびに丸ごとダウンロードされていた。11/13 のドメイン移行後にクロールが増えて急増した。
> バックエンドが用途別の小さいファイル（`vtuberIndex.json`・`vtuberDetail/NN.json`・`videoShards/NN.json`・`streamVideos.json`）を 30 分ごとに書き出すようにした。仕様は `FRONTEND_SPEC.md` 2.1・6。
> **着手前の確認**: `curl -sI https://storage.googleapis.com/vtuber-335811.appspot.com/vtuberIndex.json` と `.../streamVideos.json`、`.../vtuberDetail/00.json`、`.../videoShards/00.json` がすべて `200` であること。どれかが `404` なら PM のバックエンドのデプロイ待ちなので、P0-COST を飛ばして次のタスクに進む。
> ⚠ 1 タスク = 1 ファイル。各タスクの完了時点で `npx tsc --noEmit` と `npm run build` が通る順番にしてあるので、順番を変えないこと。見た目・表示内容は一切変えない（データの取り方だけを変える）。

- [x] **COST-1. `lib/gcs.ts` に分割ファイルの取得関数を追加し、事務所一覧を `vtuberIndex.json` から読む**
  - **対象ファイル**: `lib/gcs.ts` のみ
  - **仕様**:
    - `export const SHARD_COUNT = 64;` と `export function shardOf(id: string): string`（各文字の `charCodeAt` の合計 % 64 を `padStart(2, "0")`）を追加する。`FRONTEND_SPEC.md` 2.1 の「シャード番号」と同じ計算。
    - ファイル名定数 `export const SPLIT_FILES = { vtuberIndex: "vtuberIndex.json", streamVideos: "streamVideos.json", vtuberDetail: (shard: string) => \`vtuberDetail/${shard}.json\`, videoShard: (shard: string) => \`videoShards/${shard}.json\` } as const;` を追加する（`types/index.ts` の `GCS_FILES` は変えない）。
    - 型 `export type RawVTuberIndexItem = RawVTuber & { latestTransitionDate?: string };`、`export type RawVTuberDetailShard = Record<string, { videos?: Record<string, RawVideo>; youtubeSubscriberCountTransition?: Record<string, NumLike> }>;` を追加する。
    - 取得関数を追加する（すべて `fetchGcsJson` を使い、第 2 引数は省略＝`REVALIDATE.default`。`0` や `"no-store"` にしない）:
      - `getVTuberIndexRaw(): Promise<Record<string, RawVTuberIndexItem[]>>`
      - `getVTuberDetailShard(shard: string): Promise<RawVTuberDetailShard>`
      - `getVideoShard(shard: string): Promise<Record<string, RawVideo>>`
      - `getStreamVideoList(): Promise<Video[]>`（`streamVideos.json`、`revalidate: 300`、`toArray<RawVideo>(raw).map(normalizeVideo)`）
    - 既存の `getOfficeDataList()` は `officedataList.json` ではなく `getVTuberIndexRaw()` を使うように変える（戻り値の型・正規化はそのまま。`revalidate: 0` をやめる）。JSDoc の「約 25MB」の説明も直す。
    - 既存の `getAllVideos()` は残す（COST-2 で使わなくなる）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - フィルターの事務所一覧（`/api/office-thumbnails` とレイアウトの事務所名）が今までと同じ並びで出る。

- [x] **COST-2. トップの配信一覧を `streamVideos.json` から作る**（COST-1 の次に着手）
  - **対象ファイル**: `lib/stream-data.ts` のみ
  - **仕様**: `getAllVideos()` の代わりに `getStreamVideoList()` を使う。`trimStreamVideos()` はそのまま通す（今日〜7 日後＋過去 60 件に絞る処理は変えない）。`cacheLife` もそのまま。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - トップの「今日の配信」「明日の配信」「明日以降の配信」「過去アーカイブ」の件数・並びが、変更前とほぼ同じ（更新タイミング差の数件は可）。

- [x] **COST-3. `lib/server-data.ts` に分割ファイル版の読み込みを追加し、VTuber 詳細を `vtuberDetail/NN.json` から作る**（COST-2 の次に着手）
  - **対象ファイル**: `lib/server-data.ts` のみ
  - **仕様**:
    - `export async function loadVTuberIndex(): Promise<{ index: VTuberIndexItem[]; latestTransitionDate: Record<string, string> }>` を追加する。`"use cache"` ＋ `cacheLife("hours")`。`getVTuberIndexRaw()` から、今の `loadVTubers` と同じ並び（事務所の出現順 → 事務所内で公式を先頭）で `index` を作る。`latestTransitionDate` は channelId → `latestTransitionDate`（空文字は入れない）。
    - `getVTuberDetail(channelId)` を書き換える: `getVTuberIndexRaw()` から該当 VTuber を探し（無ければ `null`）、`getVTuberDetailShard(shardOf(channelId))` の同じ channelId の `videos`・`youtubeSubscriberCountTransition` を重ねて（`{ ...indexItem, ...shardEntry }`）、既存の `toDetail()` に渡す。シャードに無ければ `videos: {}`・推移なしで作る。`getCachedVTuberDetail` はそのまま。
    - `export async function getVideosByIds(ids: string[]): Promise<Video[]>` を追加する。ID をシャードごとにまとめ、必要なシャードだけ `getVideoShard()` で並列取得し、`ids` の順で `normalizeVideo` した動画を返す（見つからない ID は飛ばす）。
    - このファイル内で `loadVTubers()` の `index` を使っている関数（`getCachedVTuberDirectory` 系・順位・近い VTuber・ニュースのエイリアスなど）は、すべて `loadVTuberIndex()` に置き換える。
    - `loadVTubers` と `loadAllVideos` はまだ消さない（他ファイルが使っているため。COST-7 で消す）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - VTuber 詳細ページ（例: ホロライブ公式・にじさんじ所属の数名）で、動画一覧・登録者推移グラフ・順位チップ・近い VTuber が変更前と同じに出る。

- [x] **COST-4. サイトマップの VTuber 更新日を `loadVTuberIndex()` から取る**（COST-3 の次に着手）
  - **対象ファイル**: `app/sitemap.ts` のみ
  - **仕様**: `vtuberEntries()` で `loadVTubers()` の代わりに `loadVTuberIndex()` を使い、`lastModified` は `parseYmd(latestTransitionDate[item.channelId])` にする。
  - **完了条件**: `npx tsc --noEmit` / `npm run build` がエラーなし。`/sitemap.xml` の VTuber の URL 数と `lastmod` が変更前と同じ。

- [x] **COST-5. `/api/vtuber/[channelId]` を `getVTuberDetail()` で返す**（COST-4 の次に着手）
  - **対象ファイル**: `app/api/vtuber/[channelId]/route.ts` のみ
  - **仕様**: `loadVTubers()` の `details` の代わりに `getVTuberDetail(channelId)` を使う。`null` なら今と同じ 404、例外なら 502。
  - **完了条件**: `npx tsc --noEmit` / `npm run build` がエラーなし。レスポンスの JSON の形が変更前と同じ。

- [x] **COST-6. お気に入りの動画を `videoShards` から引く**（COST-5 の次に着手）
  - **対象ファイル**: `app/api/videos/route.ts` のみ
  - **仕様**: `loadAllVideos()` の代わりに `getVideosByIds(ids)` を使う。`MAX_IDS`・ID の検証・エラー時の 502 はそのまま。
  - **完了条件**: `npx tsc --noEmit` / `npm run build` がエラーなし。お気に入りに登録した動画（30 日以内のもの）が `/favorites` に今までどおり出る。

- [x] **COST-7. `loadVTubers` を `vtuberIndex.json` 版に置き換え、巨大ファイルの読み込みと `memo` を消す**（COST-6 の次に着手）
  - **対象ファイル**: `lib/server-data.ts` のみ
  - **仕様**:
    - `loadVTubers` を `export const loadVTubers = loadVTuberIndex;` にする（`app/llms.txt/route.ts`・`app/api/vtuber/route.ts`・`lib/events-data.ts`・`app/api/admin/vtubers/route.ts` は `.index` だけを使っているので、そのまま動く）。
    - `loadAllVideos`・`memo`・`TTL_MS` と、ファイル先頭の「約19MB / 約16MB をメモリ保持する」コメントを消す。
    - 変更後、`grep -rn "officedataList\|GCS_FILES.officeData\|GCS_FILES.allVideos" app lib components` で、`lib/admin/` 以外に読み込み箇所が残っていないこと（`lib/admin/feature-data.ts` は PM 管理のため触らない）。`lib/gcs.ts` の `getAllVideos()` も使われていなければ消す。
  - **完了条件**: `npx tsc --noEmit` / `npm run build` がエラーなし。`/vtuber`・VTuber 詳細・`/events`・`/llms.txt`・`/api/vtuber` が変更前と同じ内容を返す。

- [ ] **COST-8. 登録者推移ファイルを fetch キャッシュに載せる**（COST-7 の次に着手）
  - **対象ファイル**: `lib/gcs.ts` のみ
  - **前提の確認**: `curl -s --compressed https://storage.googleapis.com/vtuber-335811.appspot.com/youtubeSubscriberCountTransitionList.json | wc -c` が **1,500,000 未満**であること。Next.js は本文を base64 で保存するため、2MB の上限は元のサイズで約 1.5MB に当たる（`FRONTEND_SPEC.md` 6 章）。
    - 2026-11-22 時点は 1,939,680（インデント付きの旧形式）で、`npm run build` で `items over 2MB can not be cached (2587279 bytes)` になり Copilot が保留にした（正しい判断）。バックエンドの 24 時間ジョブが次に動くとインデントなしの約 930,000 になる。
    - 1,500,000 以上なら、何も変えずに次のタスクへ進む（このタスクは `[ ]` のまま）。
  - **仕様**: `fetchGcsJson(GCS_FILES.subscriberTransition, 0)` の `0` を消して `REVALIDATE.default` にする。関連コメント（2MB 超のため…）を直す。（`FRONTEND_SPEC.md` 6 の該当行は PM が後で直すので触らない）
  - **完了条件**: `npx tsc --noEmit` / `npm run build` がエラーなし、かつビルドログに `youtubeSubscriberCountTransitionList.json` の `items over 2MB can not be cached` が出ない。ランキングの「登録者 急上昇」が変更前と同じ。

- [x] **COST-9. 同時視聴者数ランキングを `weeklyLiveViewTop.json`（上位 500 件）から読む**（COST-8 の次に着手。COST-8 が保留でも着手してよい）
  - **対象ファイル**: `lib/gcs.ts` のみ
  - **背景**: `weeklyLiveViewRanking.json` は約 1.97MB（2,735 件）あり、base64 換算で 2MB を超えるため fetch キャッシュに載らず、ランキング・月間レポートを表示するたびに丸ごとダウンロードされている。画面で使うのは上位 100 件まで（`RANKING_LIMIT`）なので、バックエンドが上位 500 件だけの `weeklyLiveViewTop.json`（約 0.3MB、形は同じ）を 5 分ごとに書き出すようにした。
  - **前提の確認**: `curl -sI https://storage.googleapis.com/vtuber-335811.appspot.com/weeklyLiveViewTop.json` が `200`。
  - **仕様**: `getWeeklyLiveViewRanking()` が読むファイルを `"weeklyLiveViewTop.json"` に変える（COST-1 で作った `SPLIT_FILES` に `weeklyLiveViewTop` を足して使う）。`REVALIDATE.live`（60 秒）と正規化処理はそのまま。`types/index.ts` の `GCS_FILES.weeklyLiveView` は変えない。
  - **完了条件**: `npx tsc --noEmit` / `npm run build` がエラーなし、かつビルドログに `weeklyLive` の `items over 2MB can not be cached` が出ない。`/ranking` の同時視聴者数タブの上位 100 件と、今月の月間レポートの「人気配信」が変更前と同じ。

---

### P0-CHATUX: 掲示板の見た目の整理と「書き込むきっかけ」づくり（2026-11-14 追加・P0-VTFIND の次に着手。FILTER-1 が終わっていること）

> **背景（2026-11-14 本番データ）**: スレッド 29 本のうち、投稿がいちばん多いのは「個人」の 28 件。ほとんどは 0〜4 件。直近の投稿は 11/3、その前は 5/31・2/26 で、数か月に 1 件しか書き込まれていない。Bot 投稿は 0 件。
> 一方で UI は「古い順に並ぶので開くと 2025 年の投稿が先頭に出る」「0 件のスレッドカードが横に並ぶ」「注意事項パネルが最初から開いている」「押してもどこにも保存されないリアクション」があり、人がいないことが目立っている。
>
> **方針**: (1) 投稿が少なくても止まって見えない見た目にする。(2) 掲示板の外（VTuber 詳細・配信中カード）と中（お題）に、書き込むきっかけを置く。仕様の正は `FRONTEND_SPEC.md` 5.6（PM 更新済み）。
>
> ⚠ スレッドの `postCount` は実際のレス数より小さい（2.2 参照）。0 件に見えても投稿がある場合があるため、**`postCount` を根拠にスレッドを非表示にしない**こと。

- [x] **CHAT-4. 掲示板の見た目を整理する（新しい順・注意事項は閉じる・見かけだけのリアクションを外す）**
  - **対象ファイル**: `components/ChatBoard.tsx`, `lib/chat.ts`
  - **仕様**:
    - **並び順を新しい順にする**
      - 親コメントのまとまり（`groupPostsByParent` の結果）を、そのまとまりの中で最大の `postNo` の降順に並べる。返信がついたまとまりが上に上がる。
      - まとまりの中の返信は、従来どおり古い順。
      - CHAT-1 の「以前のレスを読み込む」ボタンはリストの**末尾**に移し、文言を `さらに古い投稿を読み込む` にする。動作（`before` で取得）は変えない。
      - ポーリングで届いた新着は、並べ替えによって自然に先頭に来る。自分の投稿が成功したら、ページ上部（リスト先頭）へスクロールする。
    - **注意事項パネルは最初は閉じる**
      - `RulesPanel` の初期値を `open = false` にする。閉じているときは 1 行（`📢 掲示板の注意事項` と `詳しく見る`）だけにし、余白も小さくする（`p-3`）。
      - 投稿シート（`PostSheet`）の送信ボタンの上に、1 行の注意書き `誹謗中傷・個人情報の書き込みは禁止です` を `text-xs text-zinc-500` で表示する。
    - **見かけだけのリアクションを外す**
      - `QUICK_REACTIONS` と、各投稿の絵文字ボタン列を削除する（サーバーに保存されず件数も出ないため）。
    - **1 件ごとの飾りを減らす**
      - `No.N` のバッジ（violet の塗り）をやめ、`No.N` を他のメタ情報と同じ `text-zinc-500` の文字にする。
      - 返信の投稿に付けている `返信` バッジを削除する（左のライン付きインデントで返信だと分かるため）。
      - 投稿の `返信` ボタンは、塗りをやめて文字だけ（`text-blue-600`、lucide-react の `Reply` `size={14}` 付き）にする。
    - **スレッドタブを軽くする**
      - タブの並び順は FILTER-1 のとおり。そのうえで `postCount === 0` のスレッドは、並びの最後にまとめる（非表示にはしない）。
      - タブのカードを小さくする: `min-w-44` をやめて `min-w-28`、`py-1.5`。2 行目の件数表示はそのまま。
      - タブ列の上の `投稿 N 件` の表示は削除する（`postCount` は実数より小さく、誤解を招くため）。見出し `スレッド一覧` だけ残す。
    - `any` は使わない。新しいパッケージは追加しない。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - ホロライブのスレッドを開くと、いちばん新しい投稿（またはいちばん新しい返信がついたまとまり）が先頭に出る。
    - ページを開いた時点で注意事項は 1 行に畳まれている。
    - 投稿に絵文字リアクションが出ない。
    - `FRONTEND_SPEC.md` 5.6（PM 更新済み）の記述と実装が一致している。

- [x] **CHAT-5. 掲示板に「お題」チップを出して、ワンタップで書き始められるようにする**（CHAT-4 の次に着手）
  - **対象ファイル**: `lib/chat.ts`, `components/ChatBoard.tsx`
  - **仕様**:
    - `lib/chat.ts` に `CHAT_TOPICS: readonly string[]` を追加する。中身は以下の 10 個（文言はこのまま使う）。
      - `最近いちばん笑った配信は？`
      - `推しを知ったきっかけ`
      - `今週の配信でよかったところ`
      - `初見さんにおすすめの切り抜き・アーカイブ`
      - `最近ハマってる歌ってみた・オリ曲`
      - `コラボしてほしい組み合わせ`
      - `記念配信の思い出`
      - `今やってるゲーム配信の感想`
      - `推しの好きなところをひとつ`
      - `今日の配信、何見る？`
    - `lib/chat.ts` に `pickTopics(dateKey: string, count = 3): string[]` を追加する。JST の日付文字列（`yyyy-MM-dd`）から決まる順番で 3 つ選ぶ（同じ日なら全員同じお題。日替わり）。`Math.random` は使わない（hydration のずれを防ぐ）。
    - `ThreadView` の投稿リストの上に、`話題をえらんで書く` という小見出し（`text-xs text-zinc-500`）とお題チップ 3 つを横並び（折り返し可）で出す。
      - チップの見た目: 枠線のみ、`rounded-full`、`text-xs`、`border-violet-200 text-violet-700`（ダーク: `border-violet-800 text-violet-300`）、先頭に lucide-react の `MessageCirclePlus` `size={12}`。
      - タップすると投稿シートを開き、本文の初期値を `【お題】{お題}\n` にする。
    - 投稿 0 件のとき（空状態）は、空状態の枠の中にも同じお題チップを出す。空状態の文言は `まだ投稿がありません` / `お題をえらんで、最初のひとことを書いてみよう` に変える。
    - 日付キーは、サーバーとずれないようにマウント後に `Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" })` で作る。マウント前はチップを出さない（高さが変わらないよう、1 行分の高さを確保しておく）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - スレッドを開くとお題チップが 3 つ出て、タップすると `【お題】…` が入った状態で投稿シートが開く。
    - 日付が変わるとお題が変わる。同じ日は何度開いても同じ。
    - `FRONTEND_SPEC.md` 5.6（PM 更新済み）の記述と実装が一致している。

- [ ] **CHAT-6. `/chat?channel=…&draft=…` で事務所スレッドを開き、VTuber 詳細ページから書き込めるようにする**（CHAT-5 の次に着手）
  - **対象ファイル**: `app/chat/page.tsx`, `components/ChatBoard.tsx`, `app/vtuber/[channelId]/page.tsx`, `lib/firestore.ts`（必要なら）
  - **仕様**:
    - **ディープリンク**（`components/ChatBoard.tsx`）
      - `useSearchParams` で `channel` と `draft` を読む。`app/chat/page.tsx` では `<ChatBoard>` を `<Suspense>` で包む（ビルドエラー回避）。
      - `channel`: `offices` からそのチャンネルが所属する事務所を探し、事務所名（小文字比較）が一致するスレッドを初期タブにする。見つからなければ無視して従来どおり先頭のスレッドを開く。タブの並び順は変えない（選んだタブが見えるよう、横スクロールで `scrollIntoView({ inline: "center", block: "nearest" })` する）。
      - `draft`: 前後の空白を取り、100 字で切り詰めて、スレッドが開いたあと投稿シートを 1 回だけ自動で開く（本文の初期値にする）。空なら開かない。**自動送信はしない**。
      - 投稿シートを閉じたら、`router.replace("/chat", { scroll: false })` でクエリを消す（再読込でシートが再び開かないように）。
    - **VTuber 詳細ページの入口**（`app/vtuber/[channelId]/page.tsx`）
      - `<DetailView>` の直後、`同じ事務所のVTuber` セクションの前にカードを 1 枚置く。
        - 見出し: `{事務所名}の掲示板`（`text-base font-bold`）
        - 説明: `{VTuber名}さんの話をしよう`（`text-sm text-zinc-500`）
        - ボタン: `{VTuber名}さんについて書く`（lucide-react の `PenLine` `size={16}` 付き、`rounded-xl bg-violet-600 text-white`）。リンク先は `/chat?channel={channelId}&draft={encodeURIComponent(VTuber名 + "さん ")}`。
      - 対応するスレッドがない事務所ではカードを出さない。判定はサーバー側で `listThreads()` の `name` と `detail.office` を小文字で比較する。`listThreads()` の結果は `"use cache"` + `cacheLife` で 10 分程度キャッシュし、詳細ページの描画ごとに Firestore を読まないようにする。取得に失敗したらカードを出さない（ページは落とさない）。
      - リンクは `next/link`。`rel="nofollow"` を付ける（クエリ付き URL をクロールさせない）。
    - `app/chat/page.tsx` の `metadata` に `alternates.canonical: "/chat"` がなければ追加する（`?channel=` 付き URL の重複対策）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - ホロライブ所属の VTuber 詳細ページから `○○さんについて書く` を押すと、`/chat` でホロライブのスレッドが選ばれ、本文に `○○さん ` が入った投稿シートが開く。
    - シートを閉じると URL が `/chat` に戻り、再読込してもシートは開かない。
    - スレッドのない事務所の VTuber 詳細ページにはカードが出ない。
    - `FRONTEND_SPEC.md` 5.6（PM 更新済み）の記述と実装が一致している。

- [ ] **CHAT-7. 配信中カードに「感想を書く」リンクを付ける**（CHAT-6 の次に着手）
  - **対象ファイル**: `components/VideoCard.tsx`
  - **仕様**:
    - `live === true` のカードだけ、カード下部（動画への `<a>` の**外**。`<a>` の中にリンクを入れ子にしない）に 1 行のリンクを置く。
      - 文言: `感想を書く`。先頭に lucide-react の `MessageSquare` `size={14}`。
      - 見た目: `border-t border-zinc-100 px-3 py-2 text-xs font-medium text-violet-700`（ダーク: `border-zinc-800 text-violet-300`）、`hover:bg-violet-50`（ダーク: `hover:bg-violet-950/20`）。
      - リンク先: `/chat?channel={v.channelId}&draft={encodeURIComponent("「" + タイトル先頭30字(超えたら…) + "」見てる！ ")}`。`next/link` を使い、`rel="nofollow"` を付ける。
    - 配信中以外のカード（過去アーカイブ・予定・お気に入り・VTuber タブ）には出さない。
    - 事務所スレッドがないチャンネルでも出してよい（`/chat` 側で先頭スレッドにフォールバックする。CHAT-6 の仕様）。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - 配信中タブのカードにだけ `感想を書く` が出て、押すとその配信者の事務所スレッドで、タイトル入りの投稿シートが開く。
    - カードのサムネイル・タイトルを押したときの再生動作は変わらない。
    - `FRONTEND_SPEC.md` 5.6（PM 更新済み）の記述と実装が一致している。

### P0: 見た目の底上げ（低コスト・効果大）
- [x] **P0-1. 絵文字アイコンを SVG アイコンに置き換え、BottomNav にアイコンを付ける**
  - 対象ファイル: `components/AppShell.tsx`, `components/BottomNav.tsx`, `package.json`
- [x] **P0-2. 数値の短縮表記ユーティリティ**
  - 対象ファイル: 新規 `lib/format.ts`、`components/RankingTabs.tsx`, `components/GrowthTop3.tsx`, `components/VTuberTabs.tsx`, `components/VideoCard.tsx`
- [x] **P0-3.

---

### P1-EVENTS: イベントカレンダーの重複表示の整理（2026-11-16 追加・小粒なので手が空いたら先に着手してよい）

- [x] **EVENTS-1. `/events` 上部の「今日のイベント」一覧を削除し、カレンダー下の一覧をリンク付きにする**
  - **対象ファイル**:
    `app/events/page.tsx`
    `components/EventCalendar.tsx`
    `FRONTEND_SPEC.md`（5.7）
  - **背景**: `/events` では今日のイベントが 2 回表示されている。上部の一覧（青文字リンク・サムネ無し）と、カレンダー下の日付選択一覧（サムネ有り・リンク無し）の中身は同じ。1 画面目が同じ一覧で埋まり、カレンダーがスクロールしないと見えない。S404-2 で上部一覧を追加した当時は `EventCalendar` がマウントまで「読み込み中…」を返していた。今はマウント待ちが無くなり、カレンダー下の一覧も初期 HTML にサーバー描画されるため、上部一覧は不要になった。
  - **仕様**:
    - `app/events/page.tsx` から「今日（yyyy年M月d日）のイベント」の `<section>` を丸ごと削除する。h1 直下の要約文（`今日（M月d日）が誕生日・デビュー記念日のVTuberは N 人です。`）は SEO 用に残す。
    - 上部一覧が持っていた `/vtuber/{channelId}` への内部リンクを失わないよう、`EventCalendar` の日付選択一覧の各行（サムネ＋名前）を `next/link` の `<Link href={`/vtuber/${channelId}`}>` で包む。
      - 行全体をリンクにしてよい（行内に他のタップ要素は無い）。ホバーで背景を薄く変える（`hover:bg-zinc-50 dark:hover:bg-zinc-900`）。名前の文字色は黒のまま（青文字にしない）。
      - `channelId` が空の行はリンクにせず、従来どおりの表示にする。
    - 0 件の日の文言は、カレンダー側の `イベントはありません` を使う（ページ側の `今日のイベントはありません` は削除される）。
    - `FRONTEND_SPEC.md` 5.7 の 274 行目付近（「当日のイベント一覧を…初期 HTML に含める」）を、「上部の別一覧は置かない。カレンダーの日付選択一覧（初期値は今日）がサーバー描画され、各行は `/vtuber/{channelId}` へリンクする」に書き換える。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `curl -s <URL>/events` の HTML に、今日のイベントの VTuber 名と `href="/vtuber/` のリンクが含まれる（同じ VTuber 名が一覧として 2 回並ばない）。
    - 375px 幅で、1 画面目に要約文のすぐ下のカレンダーが見える。
    - 日付をタップすると一覧が切り替わり、行をタップすると VTuber 詳細ページへ遷移する。

---

### P1-LIVEFRESH: 「配信中」に終わった配信が残る問題（2026-11-16 追加・EVENTS-1 の次に着手。STREAM-1 → STREAM-2 の順）

> **調査結果（2026-11-16）**: 終了した配信が「配信中」に残る原因は 4 つ重なっている。最悪で 1 時間以上古い一覧が出る。
> 1. バックエンド `scheduledLiveDataUpdate` は 5 分ごとに `livevideoList.json` を書き込むが、`cacheControl` を指定していない。そのため GCS 公開オブジェクトの既定値 `Cache-Control: public, max-age=3600` が付き、Google のエッジキャッシュが最大 1 時間古いファイルを返す（`curl -sI .../livevideoList.json` で確認済み）。
> 2. `getLiveVideoList()` は `revalidate: 300`（stale-while-revalidate）で取得する。アクセスが少ない時間帯は、期限切れ後の最初の 1 回にも古いデータが返る。
> 3. `StreamTabs` はマウント時に `/api/streams` を 1 回取得するだけ。開きっぱなしのタブや、スマホでアプリを切り替えて戻ってきた画面は二度と更新されない。
> 4. ユーザーが手動で更新する手段がない。iOS Safari・ホーム画面追加（PWA）では引っ張って更新もできない。

- [x] **STREAM-1. 配信中データのキャッシュを短くする（バックエンド＋API）**
  - **対象ファイル**:
    `backend-repo/functions/index.js`（`scheduledLiveDataUpdate` の `file.save`、2697 行目付近）
    `lib/gcs.ts`
    `app/api/streams/route.ts`
  - **仕様**:
    - `livevideoList.json` の `file.save` の `metadata` に `cacheControl: 'public, max-age=60'` を追加する。同じ関数内で保存している `weeklyLiveViewRanking.json` は変更しない。
    - `REVALIDATE.live` を `300` → `60` にする（`getLiveVideoList` 用）。
    - `/api/streams` のレスポンスに `Cache-Control: no-store` ヘッダーを付け、ブラウザや CDN が古いレスポンスを返さないようにする。
    - ⚠ Functions のデプロイは運営者が行う。Copilot はコードの変更とコミットまでとし、完了報告に「`firebase deploy --only functions:scheduledLiveDataUpdate` が必要」と書く。`firebase deploy --only firestore` は実行しない（P0-CHAT の注意を参照）。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `curl -sI <URL>/api/streams` に `cache-control: no-store` が含まれる。
    - （運営者のデプロイ後）`curl -sI https://storage.googleapis.com/vtuber-335811.appspot.com/livevideoList.json` が `cache-control: public, max-age=60` を返す。

- [x] **STREAM-2. 配信タブに更新ボタン・引っ張って更新・復帰時の自動更新を付ける**（STREAM-1 の次に着手）
  - **対象ファイル**:
    `components/StreamTabs.tsx`
    新規 `components/PullToRefresh.tsx`（または `lib/use-pull-to-refresh.ts`）
    `FRONTEND_SPEC.md`（5.2）
  - **仕様**:
    - **取得処理の共通化**: `StreamTabs` の `fetch("/api/streams")` を `load()` 関数にまとめ、`{ cache: "no-store" }` を付ける。取得中フラグ `refreshing` と最終取得時刻 `updatedAt` を state に持つ。
      - 再取得中は今の一覧を表示したままにする（「読み込み中…」に戻さない）。
      - 再取得に失敗したら今の一覧を残し、タブ列の右の時刻表示を `更新に失敗しました` に一時的に変える（初回の失敗だけ従来の `動画の読み込みに失敗しました。` を表示する）。
      - 選択中のサブタブとスクロール位置は再取得で変えない。
    - **更新ボタン**: サブタブ列の右端に、lucide-react の `RotateCw`（16px）と最終取得時刻 `HH:mm 更新` を並べたボタンを置く。
      - タップで `load()` を呼ぶ。取得中はアイコンを `animate-spin` で回し、ボタンを `disabled` にする。
      - `aria-label="配信一覧を更新"`。タップ領域は 44px 以上。
      - 375px 幅ではサブタブ列が横スクロールするため、ボタンはスクロール領域の外に固定する（タブ列と一緒にスクロールさせない）。狭い幅では時刻表示を省いてアイコンだけでよい。
    - **引っ張って更新（タッチ端末のみ）**: トップページで `window.scrollY === 0` の状態から下に引っ張ったら `load()` を呼ぶ。
      - 引っ張った距離に応じて、画面上部に `RotateCw` のインジケーターを下ろす（最大 80px、指の移動量の半分だけ動かす）。64px を超えて指を離したら更新し、更新中はインジケーターを回し続ける。届かずに離したら戻す。
      - `touchstart` / `touchmove` / `touchend` で実装する。`touchmove` は `{ passive: false }` にし、引っ張り中だけ `preventDefault()` する。上方向のスクロールや横スクロール（サブタブ列）、ピンチは妨げない。
      - Android Chrome の標準の引っ張って更新（ページ全体の再読み込み）と二重にならないよう、トップページ表示中だけ `document.documentElement.style.overscrollBehaviorY = "contain"` にし、アンマウント時に戻す。
      - 動画プレーヤー（`YouTubePlayer`）を開いている間は無効にする。
      - 外部ライブラリは追加しない。
    - **復帰時の自動更新**: `visibilitychange` で画面に戻ってきたとき、最終取得から 60 秒以上たっていれば `load()` を呼ぶ。また、表示中は 3 分ごとに `load()` を呼ぶ（非表示中は呼ばない）。
    - `FRONTEND_SPEC.md` 5.2 に、更新ボタン・引っ張って更新・自動更新（復帰時 60 秒、表示中 3 分）の仕様を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 更新ボタンをタップすると `/api/streams` が再取得され、時刻表示が更新される。取得中はアイコンが回る。
    - スマホ実機（iOS Safari と Android Chrome）で、一番上から引っ張って離すと一覧が再取得される。Android でページ全体の再読み込みは起きない。
    - スクロール途中で下に引っ張っても更新されず、通常どおりスクロールする。サブタブ列の横スクロールも従来どおり動く。
    - 別アプリに切り替えて 1 分以上たってから戻ると、自動で再取得される。
    - 375px 幅でサブタブ列と更新ボタンが重ならない。

---

### P0-TAP: ガイド・特集のカードが押しにくく、押しても反応が分からない（2026-11-20 追加・小粒なので P1-NEWS より先に着手）

> **調査結果（2026-11-20）**: `components/GuideCard.tsx` はタイトルの文字だけが `<Link>` で、カードの余白・カテゴリ・説明文を押しても何も起きない。スマホでは指がタイトルから外れやすい。さらに押した瞬間の見た目の変化も、遷移待ちの表示も無く、`app/guide/[slug]`・`app/guide`・`app/reports/[month]` には `loading.tsx` も無いため、通信が遅いと「押せたのか分からない」まま待つことになる。`GuideCard` はトップページの「ガイド・特集」と `/guide` の両方で使われている。

- [x] **TAP-1. ガイドのカード全体をタップ対象にし、押した瞬間の反応と遷移中の表示を付ける**
  - **対象ファイル**: `components/GuideCard.tsx`、新規 `components/CardLinkStatus.tsx`（Client Component）、`app/reports/page.tsx`、`components/PageSkeleton.tsx`（`maxWidth` に `3xl` を追加）、新規 `app/guide/loading.tsx`・`app/guide/[slug]/loading.tsx`・`app/reports/[month]/loading.tsx`、`FRONTEND_SPEC.md`（6.2 の TAP-1）
  - **仕様**（`FRONTEND_SPEC.md` 6.2「ガイド・レポートのカードのタップ」のとおり）:
    - `GuideCard`: `<article>` に `relative`、タイトルの `<Link>` に `after:absolute after:inset-0 after:content-['']` を付け、カードのどこを押しても記事に移動するようにする。`<h3>` とリンク文言（タイトル）は変えない。カード全体を `<Link>` で包む方法は使わない（見出しの中にリンクがある構造を保つ）。
    - カード右下に `読む` ＋ `ChevronRight`。押した瞬間 `active:scale-[0.99] active:bg-zinc-50 dark:active:bg-zinc-800`、`transition`、`touch-manipulation`、`hover:border-blue-400`。
    - `CardLinkStatus`: `useLinkStatus()` を使い、`pending` の間は `Loader2`（`animate-spin`）＋ `読み込み中` を表示し、そうでなければ `読む` ＋ `ChevronRight` を表示する。`useLinkStatus` はリンクの子孫でしか動かないので、`<Link>` の中（タイトルの後ろ）に置き、位置は `absolute bottom-4 right-4` で右下に出す。カード本体を薄くする表示（`opacity-70`）は、同じ `pending` を使って `CardLinkStatus` から親に伝えるのではなく、`group` と `has-[[data-pending=true]]:opacity-70` のように CSS で行う（Client Component の範囲を広げない）。表示の切り替えは 100ms 遅らせる。
    - `/reports` の月カード（既に `<Link>` がカード全体）にも、同じ `active:` の反応と `CardLinkStatus` を付ける（右端の `月間レポート →` / `集計中 →` を、遷移中だけ `読み込み中` に替える）。
    - `loading.tsx` を 3 つ追加する: `/guide` は `<PageSkeleton variant="list" maxWidth="4xl" />`、`/guide/[slug]` は `<PageSkeleton variant="detail" maxWidth="3xl" />`、`/reports/[month]` は `<PageSkeleton variant="detail" maxWidth="4xl" />`。
    - `<Link>` の `prefetch` は既定のまま（無効にしない）。`any` は使わない。新しいパッケージは追加しない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - トップページの「ガイド・特集」と `/guide` で、カードの説明文・余白・カテゴリ行を押しても記事に移動する。カードの外（カード間の隙間）を押しても移動しない。
    - スマホ（375px）で押した瞬間にカードが少し沈み、背景色が変わる。
    - DevTools の Network で「Slow 3G」にしてカードを押すと、すぐに `読み込み中` のくるくるが出て、続けて記事の骨組み（スケルトン）が表示される。`/reports` の月カードも同様。
    - スクリーンリーダー向けのリンク名はタイトルのまま（`読む` がリンク名に混ざらないよう、`CardLinkStatus` の表示文言は `aria-hidden`）。
    - ダークモードで読める。キーボードの Tab でカードにフォーカスしたとき、フォーカス枠がカード全体に見える（`after:` 側に `focus-visible` の枠を付ける）。

---

### P0-READNAV: 特集・月間レポートへの導線をファーストビュー付近に置く（2026-11-21 追加・CHAT-7 の次、P1-NEWS より先に着手。READ-1 → READ-4 の順）

> **調査結果（2026-11-21）**: 特集（`/guide`）と月間レポート（`/reports`）へのリンクは、フッターと、トップの配信一覧のさらに下にある「ガイド・特集」欄にしかない。上部・下部のナビにも、ランキングにも無い。週刊特集と月報コメントの自動作成（`FRONTEND_SPEC.md` 5.12.2・5.12.3）が始まったので、読まれる場所に出す。仕様は `FRONTEND_SPEC.md` 5.13。
> ⚠ 自動パイプラインは 1 回で 1 ファイルしか変えられないので、タスクを 1 ファイルずつに分けてある。READ-2・READ-3 は READ-1 の部品を使うので、必ず READ-1 の後に着手すること。

- [ ] **READ-1. 読みものへのリンク部品 `ReadingLinks` を作る**
  - **対象ファイル**: 新規 `components/ReadingLinks.tsx`（Server Component。`"use client"` を付けない）
  - **仕様**: `FRONTEND_SPEC.md` 5.13 の「共通部品」のとおり。
    - `export async function ReadingLinks({ variant }: { variant: "card" | "chips" })`。
    - 最新の特集は `getAllGuides()`（`@/lib/guide`）から `category === "特集"` の最初の 1 本。無ければ `/guide` への固定リンクにする。
    - 月は `await getCurrentReportContext()`（`@/lib/reports`）の `month`（`YYYY-MM`）を使う。`new Date()` や `Date.now()` をこのファイルで使わない（`cacheComponents` 有効のためビルドが落ちる）。表示用の月は `Number(month.slice(5, 7))`。
    - アイコンは `lucide-react` の `Sparkles`・`BookOpen`・`BarChart3`・`ChevronRight`。`next/link` の `<Link>` を使う。
    - `card` と `chips` のクラスは仕様に書いたとおり。ダークモードのクラスも付ける。
    - この時点ではどのページにも置かない（READ-2・READ-3 で置く）。`any` は使わない。新しいパッケージは追加しない。
  - **完了条件**: `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。

- [ ] **READ-2. トップの「今週の急上昇」の直後に `ReadingLinks`（card）を置く**（READ-1 の次に着手）
  - **対象ファイル**: `app/page.tsx`
  - **仕様**: `<GrowthTop3 items={growth} />` の直後、`<section id="streams" …>` の前に `<ReadingLinks variant="card" />` を置く（`ReadingLinks` 側に `mb-6` が無ければ `<div className="mb-6">` で包む）。配信の下の既存「ガイド・特集」欄は消さない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - スマホ（375px）でトップを開くと、スクロールせずに、または 1 回のスクロールで「最新の特集」と「{M}月の月間レポート」が見え、押すとそれぞれの記事・レポートに移動する。
    - 選択中の事務所があって `GrowthTop3` が表示されないときも、`ReadingLinks` は表示される。

- [ ] **READ-3. ランキングの説明文の直後に `ReadingLinks`（chips）を置く**（READ-2 の次に着手）
  - **対象ファイル**: `app/ranking/page.tsx`
  - **仕様**: 説明文（`{summary}` の `<p className="mb-4 …">`）の直後、`{weekly ? (<Suspense …>` の前に `<ReadingLinks variant="chips" />` を置く（下に `mb-4` の余白）。ランキングの読み込みに失敗したときも表示する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - スマホ（375px）でチップが 1 行に収まり、表の開始位置が 1 行分（約 44px）以上は下がらない。

- [ ] **READ-4. 設定ページに「読みもの」欄を追加する**（READ-3 の次に着手）
  - **対象ファイル**: `components/SettingsList.tsx`
  - **仕様**: 「共有する」ボタンの前に、見出し「読みもの」（`h2`、`text-sm font-bold`）と、`next/link` の `<Link>` 3 つ（`ガイド・特集` → `/guide`、`月間レポート` → `/reports`、`誕生日・周年カレンダー` → `/events`）を置く。見た目は既存の `btn` と同じで、右端に `ChevronRight`（`lucide-react`、`aria-hidden`）。`"use client"` のままでよい（データは使わない）。
  - **完了条件**: `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。`/settings` から 3 つのページに移動できる。

---

### P1-NEWS: ニュースタブの改善 — 同じ話題をまとめ、注目・公式の記事を目立たせる（2026-11-19 追加・P1-LIVEFRESH の次、AI 提案タスクより先に着手。NEWS-1 → NEWS-7 の順）

> **調査結果（2026-11-19、`news.json` 93 件）**:
> 1. 同じ話題が何件も並ぶ（「前野ハカリ デビュー」5 件、「みたらし団 3 周年グッズ」4 件）。`scheduledNewsUpdate` の重複除去はタイトル完全一致だけ（「AI で判定」のコメントはあるが中身はタイトル比較）。
> 2. ニュースでないものが混ざる（YouTube の切り抜き・雑談配信 5 件、X のプロフィール `t.co`、Howl.Link）。
> 3. 古い記事が残る（2026 年 2 月・4 月）。
> 4. 取得元が SerpApi の 1 検索（`Vtuber OR ホロライブ OR にじさんじ`）だけで、他事務所・個人勢が入りにくい。
> 5. 人気・記事の質を示すデータが無い。
>
> 仕様は `FRONTEND_SPEC.md` 5.3（5.3.1〜5.3.5）に書いた。数値（まとめの基準 0.5、呼び名の規則など）は実データで試して決めたものなので、変えないこと。
> ⚠ バックエンドのタスク（NEWS-4・NEWS-5・NEWS-6 の一部・NEWS-7）は `backend-repo`（別リポジトリ `vtuberchannel`）の変更。Functions のデプロイは運営者が行う。Copilot はコードの変更と `backend-repo` へのコミット・push、親リポジトリのサブモジュール参照の更新までとし、完了報告に必要な `firebase deploy --only functions:<関数名>` を書く。`firebase deploy --only firestore` は実行しない。

- [x] **NEWS-1. ニュースを加工する純粋関数を作る（ノイズ除去・媒体区分・同じ話題のまとめ・カテゴリ・VTuber 紐づけ）**
  - **対象ファイル**: 新規 `lib/news.ts`、新規 `lib/news-sources.ts`、`types/index.ts`（`News` に `origin?: string` を追加）、`lib/server-data.ts`、`FRONTEND_SPEC.md`（5.3.1 に実装上の差分があれば追記）
  - **仕様**（`FRONTEND_SPEC.md` 5.3.1 のとおり）:
    - `lib/news-sources.ts`: 区分表（`official` / `media` / `aggregator` をホスト名と媒体名の両方で）、ノイズのホスト・媒体名、`EXTRA_ALIASES`（`channelId` → 呼び名配列）。`EXTRA_ALIASES` には、ホロライブで英語名だけのチャンネル（例: `Suisei Channel` → `星街すいせい`）を 5 人以上入れる。`channelId` は `officedataList.json` で確認する。
    - `lib/news.ts` に次をエクスポートする（すべて純粋関数。現在時刻は引数 `now: number` で受け取る）。
      - `newsId(url: string): string` — FNV-1a 32bit を 36 進数。
      - `getNewsTier(n: News): NewsTier`
      - `isNoiseNews(n: News, now: number, maxAgeDays?: number): boolean`（既定 14 日）
      - `normalizeTitleForCluster(title: string): string` と `titleBigrams(title: string): Set<string>`
      - `categorizeNews(title: string): NewsCategory` と `NEWS_CATEGORY_LABELS`
      - `buildVTuberAliasIndex(index: VTuberIndexItem[]): Map<string, VTuberRef>`（呼び名 → `{ channelId, name, thumbnail }`。重複する呼び名は除外）
      - `clusterNews(items: News[], opts: { now: number; aliases: Map<string, VTuberRef>; clicks?: Record<string, number>; maxAgeDays?: number }): NewsCluster[]` — ノイズ除去 → 新しい順 → 代表とだけ比較してまとめる → 代表選び → カテゴリ・VTuber・score。戻り値は新しい順。
    - 型 `NewsTier`、`NewsCategory`、`VTuberRef`、`NewsItemView`（`id` `title` `url` `source` `tier` `imageSrc` `publishedAt` `videoUrl?`）、`NewsCluster`（`id`（代表の id）`lead` `others` `sourceCount` `category` `vtubers` `latestAt` `score` `clicks`）を `lib/news.ts` に置く。`imageSrc` は従来どおり `/api/news-image?u=...` に変換済みの値（無ければ `null`）。
    - `lib/server-data.ts` に `getCachedNewsClusters()` を追加する（`"use cache"` + 10 分程度の `cacheLife`。`getNews()` と `loadVTubers()` の index を使う）。`news.json` の取得に失敗したら `null` を返す（ページ側のエラー表示用）。
    - `any` は使わない。新しいパッケージは追加しない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 一時スクリプト（コミットしない）で現在の `news.json` に `clusterNews` をかけ、次を PR 本文に貼る: 入力件数・ノイズ除去後の件数・クラスタ数、媒体数 2 以上のクラスタの一覧（代表のタイトルと媒体名）、VTuber が紐づいたクラスタ数。2026-11-19 のデータなら「前野ハカリ」5 件が 1 つ、「みたらし団」4 件が 1 つにまとまり、別のグッズ記事（`Unit Selection Calendar` と `にじたうんぐっず`）は別クラスタのままになる。
    - YouTube・`t.co`・Howl.Link の記事と 14 日より古い記事が結果に含まれない。

- [x] **NEWS-2. `/news` を作り直す（今日の注目・カテゴリチップ・日付見出し・まとめカード）**（NEWS-1 の次に着手）
  - **対象ファイル**: `app/news/page.tsx`、新規 `components/NewsList.tsx`（Client Component。チップと一覧）、新規 `components/NewsClusterCard.tsx`、`FRONTEND_SPEC.md`（5.3.2）
  - **仕様**（`FRONTEND_SPEC.md` 5.3.2 のとおり）:
    - `app/news/page.tsx` は `getCachedNewsClusters()` を使う。見出しの下に説明文と `最終更新 HH:mm`（JST）。
    - `今日の注目`（サーバーで描画）→ カテゴリチップと一覧（`NewsList`）の順。
    - クライアントに渡すのは `NewsCluster[]` だけ。`description` などは渡さない。
    - カテゴリチップ・`♥ お気に入り` チップ・日付見出し・0 件表示は 5.3.2 のとおり。お気に入りは `hooks/useFavorites` を使い、マウント前（サーバー描画時）は `♥ お気に入り` チップと `♥` を出さない（ハイドレーションのずれを避ける）。
    - カード内のリンクは入れ子にしない。外部リンクは `target="_blank" rel="noopener noreferrer"`。`videoUrl` があれば従来どおり `▶ 解説動画を見る` を出す。
    - アイコンは lucide-react（`Newspaper`、`Heart`、`ChevronDown`）。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/news` で、複数媒体が報じた話題が 1 枚のカードになり、`ほか N 媒体` を開くと他の記事へのリンクが並ぶ。`今日の注目` に `N媒体が報道` のカードが出る。
    - 公式の記事（PR TIMES・企業・ホロライブ公式など）に `公式` バッジが出る。
    - カテゴリチップを押すとそのカテゴリだけになり、件数表示と一致する。再取得のリクエストは発生しない。
    - VTuber アイコンを押すと `/vtuber/[channelId]` に移動し、記事は開かない。
    - お気に入り登録済みの VTuber の記事があると `♥ お気に入り` チップが出る。ブラウザのコンソールにハイドレーションの警告が出ない。
    - 375px 幅で横スクロールが出ない。ダークモードで読める。`curl -s <URL>/news -o news.html && wc -c news.html` が改修前の 1.5 倍以内。

- [x] **NEWS-3. VTuber 詳細ページに「関連ニュース」を出す**（NEWS-2 の次に着手）
  - **対象ファイル**: `app/vtuber/[channelId]/page.tsx`、`lib/server-data.ts`、`FRONTEND_SPEC.md`（5.3.3）
  - **仕様**（`FRONTEND_SPEC.md` 5.3.3 のとおり）:
    - `getCachedNewsClusters()` の結果から、`vtubers` にその `channelId` を含むクラスタを新しい順に最大 5 件。
    - 「よくある質問」の前に `<section className="mt-8">` ＋ `<h2 className="mb-3 text-base font-bold">関連ニュース</h2>`。各行は媒体名（`公式` バッジ含む）・タイトル（外部リンク）・`M/D`。末尾に `/news` への `ニュース一覧へ` リンク。
    - 0 件なら節ごと出さない。ニュースの取得に失敗してもページ全体はエラーにしない（節を出さないだけ）。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - その日の `news.json` に名前が出ている VTuber の詳細ページに関連ニュースが出る。出ていない VTuber のページには節が無い。
    - VTuber 詳細ページの HTML サイズの増加が 1 ページあたり +5KB 以内。

- [x] **NEWS-4. バックエンド: 取得元を増やし、ノイズと古い記事を除き、SerpApi の鍵を環境変数に移す**（NEWS-3 の次に着手）
  - **対象ファイル**: `backend-repo/functions/index.js`（`scheduledNewsUpdate`、1250 行目付近）、`FRONTEND_SPEC.md`（5.3.5・2.1）
  - **仕様**（`FRONTEND_SPEC.md` 5.3.5 のとおり）:
    - **鍵**: SerpApi の URL に直書きされている `api_key` を削除し、`runWith({ secrets: ['SERPAPI_KEY'] })` ＋ `process.env.SERPAPI_KEY` にする。鍵が未設定なら SerpApi だけ飛ばして他の取得元は続ける。
    - **ホロライブ公式 RSS**: `https://hololivepro.com/news/feed/` を `rss-parser` で読む。`channel: 'ホロライブ公式'`、`url`・`sourceUrl` は記事 URL、`publishedAt` は `pubDate` を JST の `YYYY-MM-DD HH:mm:ss` に、`urlToImage: ''`（RSS に画像が無く、og:image もサイト共通画像のため）、`origin: 'hololive'`。
    - **Google News RSS（追加検索 2 本、無料）**: `https://news.google.com/rss/search?q=<クエリ>&hl=ja&gl=JP&ceid=JP:ja`。クエリは `ぶいすぽ OR ネオポルテ OR ななしいんく OR 774inc OR .LIVE` と `VTuber デビュー OR 個人勢VTuber`。タイトル末尾の ` - 媒体名` を除き、`channel` は `<source>` の文字列、`url` は `link`、`origin: 'gnews'`。
    - SerpApi の記事には `origin: 'serpapi'` を付ける。
    - 取得元ごとに try/catch し、1 つが失敗しても他は書き込む。
    - 結合後、`FRONTEND_SPEC.md` 5.3.1 の 1 と同じノイズ除去（ホスト・媒体名）と 14 日の期限をかけ、URL 重複を除き、新しい順に最大 150 件にする。既存のタイトル完全一致の重複除去と `videoUrlMap.json` の付与は残す。使われていない「AI で判定」のコメントと空ループは整理してよい。
    - `news.json` の `file.save` の `metadata` に `cacheControl: 'public, max-age=600'` を付ける。
  - **完了条件**:
    - `node --check backend-repo/functions/index.js` が通る。親リポジトリで `npx tsc --noEmit` と `npm run build` が成功する。
    - `grep -n "serpapi.com" backend-repo/functions/index.js` に `api_key=` の直書きが無い。
    - 完了報告に、運営者の作業として次を書く: ① SerpApi の管理画面で鍵を作り直す（旧鍵は Git 履歴に残るため）② `firebase functions:secrets:set SERPAPI_KEY` ③ `firebase deploy --only functions:scheduledNewsUpdate` ④ デプロイ後、`news.json` に `origin` が `hololive` / `gnews` の記事が入り、YouTube・`t.co` の記事が無いことを確認。

- [x] **NEWS-5. バックエンド: 記事を月ごとに蓄積し、関連ニュースで過去 60 日分を使う**（NEWS-4 の次に着手）
  - **対象ファイル**: `backend-repo/functions/index.js`（`scheduledNewsUpdate`）、`lib/gcs.ts`、`lib/server-data.ts`、`FRONTEND_SPEC.md`（2.1・5.3.3）
  - **仕様**:
    - `news.json` を書いた後、記事を `publishedAt` の月ごとに `news/archive/YYYY-MM.json` へ追記する（既存を読み、URL で重複を除き、新しい順で保存。削除はしない）。`cacheControl: 'public, max-age=3600'`。
    - フロントに `getNewsArchive(month: string)` を追加する（ファイルが無い・404 なら空配列）。
    - NEWS-3 の関連ニュースは、`news.json` ＋ 今月と前月のアーカイブを結合して URL 重複を除き、`clusterNews(..., { maxAgeDays: 60 })` をかけたものから選ぶ。`/news` は従来どおり 14 日。
  - **完了条件**:
    - `node --check backend-repo/functions/index.js` が通る。`npx tsc --noEmit` と `npm run build` が成功する。
    - アーカイブがまだ無い状態でも `/vtuber/[channelId]` がエラーにならない。
    - 完了報告に `firebase deploy --only functions:scheduledNewsUpdate` が必要と書く。

- [ ] **NEWS-FIX-1. Google News 由来の関係ない記事（EXILE・音楽ライブ・スポーツ中継など）を除く**（🚨 NEWS-TAP より先に着手）
  - **対象ファイル**: `lib/news.ts`、`lib/news-sources.ts`、`backend-repo/functions/index.js`（`scheduledNewsUpdate` の Google News RSS の検索語と絞り込み）、`FRONTEND_SPEC.md`（5.3.2.1・5.3.5）
  - **背景**: 2026-11-22 の `news.json` 150 件のうち 58 件が Google News RSS（`origin: "gnews"`）由来で、VTuber 関係は 3〜4 件だけ。NEWS-4 の検索語の `.LIVE` が「LIVE」全般に一致している（PM の仕様ミス）。この記事は画像も無いため、サムネが出ない記事のほとんどがこれ。
  - **仕様**（`FRONTEND_SPEC.md` 5.3.2.1 のとおり）:
    - フロント: `lib/news-sources.ts` に `VTUBER_KEYWORDS`（正規表現）と `VTUBER_MEDIA`（PANORA、MoguLive / Mogura VR の媒体名・ホスト名）を追加する。`clusterNews` のノイズ除去の後、`origin === "gnews"` の記事は「キーワードに一致」「VTuber の呼び名に一致」「VTuber 専門メディア」のどれかを満たすものだけ残す。`origin` が無い記事・SerpApi・ホロライブ公式には条件をかけない。デプロイ前のデータにもすぐ効くよう、フロントの実装を先に入れる。
    - バックエンド: Google News RSS の 1 本目の検索語から `.LIVE` を外して `どっとライブ` に替える（`ぶいすぽ OR ネオポルテ OR ななしいんく OR 774inc OR どっとライブ`）。gnews の記事はキーワードか VTuber 専門メディアの条件を満たすものだけ `news.json` に入れる（呼び名の照合はフロントだけ）。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。`node --check backend-repo/functions/index.js` が通る。
    - 一時スクリプト（コミットしない）で現在の `news.json` に `clusterNews` をかけ、gnews 由来で残った記事の一覧を PR 本文に貼る。EXILE TRIBE mobile・ビルボードライブ・ナタリー（音楽）・スポーツ中継の記事が残っていないこと。`アップランドフェス`・`らびぱれ!!`・`UltraLMTM` の記事は残ること。
    - 完了報告に `firebase deploy --only functions:scheduledNewsUpdate` が必要と書く。

- [ ] **NEWS-THUMB. サムネが無い記事に、同じ話題の別媒体の画像を借り、それでも無ければカテゴリ別のかわいい代替サムネを出す**（NEWS-FIX-1 の次、NEWS-TAP より先に着手）
  - **対象ファイル**: `lib/news.ts`（`NewsCluster` に `imageSrc` を追加）、新規 `components/NewsThumbFallback.tsx`、`components/SafeImage.tsx`（`fallback?: ReactNode` を追加）、`components/NewsClusterCard.tsx`、`FRONTEND_SPEC.md`（5.3.2.1）
  - **仕様**（`FRONTEND_SPEC.md` 5.3.2.1 のとおり）:
    - `NewsCluster.imageSrc`: 代表記事の `imageSrc`、無ければ `others` で最初に画像がある記事の `imageSrc`、どれも無ければ `null`。カードはこの値を使う。
    - `SafeImage` に任意の `fallback` を追加する。指定されていれば、`src` が空・読み込み失敗のときに既定のアイコンの代わりにそれを表示する。既存の呼び出し元の挙動は変えない。
    - `NewsThumbFallback({ category, source, size: "list" | "featured", className })`: 5.3.2.1 の表のとおり、カテゴリ別のグラデーション＋アイコン＋媒体名。色のクラスはカテゴリごとに完全なクラス名を書いたオブジェクトで持つ（文字列の組み立て禁止）。Server Component のままでよい（状態を持たない）。
    - `NewsClusterCard` の一覧・今日の注目の両方で、`SafeImage` に `fallback={<NewsThumbFallback ... />}` を渡す。
    - `any` は使わない。新しいパッケージや画像ファイルは追加しない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/news` に壊れた画像アイコン（`ImageOff`）が 1 つも出ない。画像が無い記事は、カテゴリに合った色とアイコンと媒体名の代替サムネになる（例: ライブ・イベントは水色にマイク）。
    - 代表記事に画像が無くても、`ほか N 媒体` に画像付きの記事があればその画像が出る。
    - 画像の URL が 404 のときも代替サムネに切り替わる（DevTools で画像のリクエストをブロックして確認）。
    - 375px 幅とダークモードで、代替サムネが元のサムネと同じ大きさで崩れない。

- [ ] **NEWS-TAP. ニュースカードの上段全体を押せるようにする（タイトルの文字だけでなく、媒体名・日時・余白も）**（NEWS-6 より先に着手）
  - **対象ファイル**: `components/NewsClusterCard.tsx`、`FRONTEND_SPEC.md`（5.3.2 の「タップ範囲」）
  - **背景**: NEWS-2 の仕様に「カード全体を `<a>` で包むのをやめる」と書いたため、記事が開くのはサムネとタイトルの文字だけになり、媒体名・日時・余白を押しても反応しない（PM の仕様ミス）。スマホでは押しても反応しないカードに見える。ガイドのカード（TAP-1）と同じ「カード全体に広がるリンク」で直す。
  - **仕様**（`FRONTEND_SPEC.md` 5.3.2「タップ範囲」のとおり）:
    - `<article>` に `relative`、`transition`、`touch-manipulation`、`hover:border-blue-400`、`active:bg-zinc-50 dark:active:bg-zinc-800`。
    - タイトルの `<a>` に `after:absolute after:inset-0 after:content-['']` を付ける。フォーカス枠はカード全体に出す（`focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-blue-500 after:rounded-xl`）。
    - サムネの `<a>` は残してよいが `tabIndex={-1}` と `aria-hidden="true"` にする（同じリンクの重複を読み上げ・Tab 移動から外す）。
    - VTuber チップの `<Link>`、`ほか N 媒体` の `<details>`、`▶ 解説動画を見る` の `<a>` には `relative z-10` を付け、広げたリンクより手前に出す。
    - タップ対象を広げる: `<summary>` は `py-2`（高さ 32px 以上）、開いた中の各記事の `<a>` は `block py-1.5`、VTuber チップは `py-1.5`。
    - `今日の注目`（`featured`）のカードも同じ扱いにする。
    - 見た目（色・レイアウト）、リンク先、`target="_blank" rel="noopener noreferrer"` は変えない。`any` は使わない。新しいパッケージは追加しない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/news` と `今日の注目` のカードで、媒体名・日時・カード上段の余白を押すと代表記事が新しいタブで開く。
    - VTuber チップを押すと `/vtuber/[channelId]` に移動し、記事は開かない。`ほか N 媒体` を押すと開閉するだけで記事は開かない。開いた中の記事を押すとその記事が開く。
    - スマホ（375px）で押した瞬間にカードの背景色が変わる。
    - キーボードの Tab で、1 枚のカードにつき代表記事へのフォーカスが 1 回だけ止まり、枠がカード全体に出る。
    - ダークモードで読める。

- [x] **NEWS-6. サイト内のクリック数を記録し、「Vちゃんねるで読まれている」を出す**（NEWS-5 の次に着手）
  - **対象ファイル**: 新規 `app/api/news/click/route.ts`、新規 `lib/news-clicks.ts`（server-only）、`components/NewsList.tsx`・`components/NewsClusterCard.tsx`、`app/news/page.tsx`、`app/vtuber/[channelId]/page.tsx`、`lib/server-data.ts`、`backend-repo/functions/index.js`（古いクリック記録の削除）、`FRONTEND_SPEC.md`（5.3.2・5.3.4）
  - **仕様**（`FRONTEND_SPEC.md` 5.3.4 のとおり）:
    - `lib/news-clicks.ts`: `firebase-admin` の Realtime Database を、環境変数 `FIREBASE_SERVICE_ACCOUNT`・`FIREBASE_DATABASE_URL` で初期化する（名前付きアプリ `news` にする。**`lib/admin/` のファイルは編集も import もしない**）。`incrementNewsClick(id)` と `getNewsClicks24h(): Promise<Record<string, number>>`（今日と昨日の合計。10 分キャッシュ）。環境変数が無い・失敗したときは記録せず、読み取りは `{}` を返す。
    - `POST /api/news/click`: 本文 `{ id }`。形式チェックと「現在のクラスタ一覧の記事の id に含まれるか」を確認し、OK なら加算。結果に関係なく 204 を返す。
    - クライアント: 記事リンク（代表・`ほか N 媒体` の各記事・関連ニュース）のクリックで `sendBeacon`。同じ id は 1 日 1 回（`localStorage` の `newsClicked:YYYYMMDD` に id の配列。前日以前のキーは消す。読み書きは try/catch）。
    - `getCachedNewsClusters()` で `clicks` を `clusterNews` に渡し、score に反映する（クラスタのクリック数 = クラスタ内の記事のクリック数の合計）。
    - `/news` の `今日の注目` の下に `Vちゃんねるで読まれている`（5.3.2）。24 時間のクリック数 3 以上のクラスタが無ければ出さない。
    - バックエンド: `scheduledNewsUpdate` の 6:30 の実行時に、RTDB `newsClicks` の 7 日より古い日付ノードを削除する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。`node --check backend-repo/functions/index.js` が通る。
    - ローカル（環境変数あり）で記事をクリックすると、RTDB の `newsClicks/<今日>/<id>` が 1 増える。同じ記事を続けてクリックしても増えない。存在しない id を POST しても増えない。
    - 環境変数が無い環境でも `/news` が表示でき、クリックでエラーが出ない。
    - 完了報告に `firebase deploy --only functions:scheduledNewsUpdate` が必要と書く。Vercel の本番環境変数 `FIREBASE_SERVICE_ACCOUNT`・`FIREBASE_DATABASE_URL` が設定済みか運営者に確認を依頼する（管理画面用に設定済みのはず）。

- [x] **NEWS-7. バックエンド: 媒体ごとの広告量を週 1 回測り、「今日の注目」の順位に反映する**（NEWS-6 の次に着手）
  - **対象ファイル**: `backend-repo/functions/index.js`（新規 `scheduledNewsSourceAudit`）、`lib/gcs.ts`、`lib/news.ts`、`lib/server-data.ts`、`FRONTEND_SPEC.md`（2.1・5.3.1・5.3.5）
  - **仕様**:
    - 毎週月曜 4:00（JST）に実行。今月と前月のアーカイブから、記事が 3 件以上ある媒体（ホスト名）ごとに新しい記事を 2 件選び、HTML を取得する（汎用的なボット名の User-Agent、タイムアウト 10 秒、1 リクエストごとに 1 秒待つ。`news.google.com` のリンクは対象外）。
    - HTML 内の広告の目印の出現数を数える: `googlesyndication`、`adsbygoogle`、`doubleclick`、`googletagservices`、`gnads`、`i-mobile`、`fluct`、`microad`、`ad-stir`、`taboola`、`outbrain`、`popin`、`logly`、`yads`、`amazon-adsystem`。2 件の平均を `adCount` とする。
    - `newsSourceScores.json` に `{ "<ホスト名>": { adCount, sampled, checkedAt } }` を保存する（`cacheControl: 'public, max-age=3600'`）。
    - フロント: `getNewsSourceScores()`（無ければ `{}`）を `clusterNews` の opts に渡し、代表記事のホストの `adCount` が 20 以上なら score −2、5 以下なら +1。**画面には表示しない**（特定媒体の低評価を公開しない）。
  - **完了条件**:
    - `node --check backend-repo/functions/index.js` が通る。`npx tsc --noEmit` と `npm run build` が成功する。
    - `newsSourceScores.json` が無い状態でも `/news` が従来どおり表示される。
    - 完了報告に `firebase deploy --only functions:scheduledNewsSourceAudit` が必要と書く。

---

### 🤖 AI 提案タスク（自動追加・PM 未レビュー。上の PM のタスクがすべて終わってから着手）

- [ ] **AI-20261114. ランキング・急上昇・配信カードのチャンネル名から VTuber 詳細ページへ内部リンクを張る**
  - **対象ファイル**:
    `components/RankingTabs.tsx`
    `components/GrowthTop3.tsx`（急上昇タブの行・上位 3 人表示を含む）
    `components/VideoCard.tsx`
    `FRONTEND_SPEC.md`
  - **背景**: data.vmato.jp は、ランキングの行から VTuber の個別ページへ 1 タップで移動できる。Vちゃんねるでは、ランキング行・急上昇行・配信カードのチャンネル名がテキスト表示のみで、詳細ページ（`/vtuber/{channelId}`）へ移動できない。そのため次の問題がある。
    - 「気になった VTuber の登録者推移や最新動画を見る」という自然な回遊が起きない。
    - 詳細ページへの内部リンクが少なく、クロールや評価が伝わりにくい。
  - **仕様**:
    - ランキング（週間同時視聴者数・YouTube 登録者数・動画本数）の各行で、サムネイルと VTuber 名を `next/link` の `<Link href={`/vtuber/${channelId}`}>` で包む。
      - 行全体は包まない。週間同時視聴者数タブでは行内に動画への導線があるため、タップ領域を分ける。
      - 週間同時視聴者数タブの既存の動画再生導線は変えない。
    - 登録者急上昇タブの各行と上位 3 人表示（`GrowthTop3`）も、サムネイルと名前を同じ `<Link>` にする。
    - 配信カード（`VideoCard`）のチャンネル名を、`channelId` がある場合だけ `<Link href={`/vtuber/${channelId}`}>` にする。
      - カード本体のタップ（動画再生）と干渉しないよう、リンクのクリックでは `e.stopPropagation()` を呼ぶ。
      - `channelId` が空なら、従来どおりテキスト表示にする。
    - `channelId` が空の行はリンクにせず、従来どおりテキスト表示にする。
    - リンクのスタイルは次のとおり。
      - ホバーで下線または violet 系の文字色にする。
      - ダークモード対応にする。
      - 375px 幅でレイアウトが崩れないようにする。
      - 名前は `truncate` で省略表示し、行の高さを変えない。
    - `onClick` だけの遷移にはしない（6.1 の内部リンク方針）。必ず `<a href>` になる `<Link>` を使う。
    - サーバーが `RankingTabs` に渡す `RankingRow` には、すでに `channelId` が含まれている。新しいフィールドは追加しない。`/ranking` の HTML 増加は 500KB 制限の範囲内に収める。
    - `FRONTEND_SPEC.md` の 5.2（配信カード）と 5.5（ランキング行）に、「サムネイル・名前・チャンネル名から `/vtuber/{channelId}` へリンクする」旨を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `curl -s <URL>/ranking` の HTML に `href="/vtuber/` のリンクが複数含まれ、HTML サイズが 500KB 以下のまま。
    - ランキング各タブ・急上昇タブの行をタップすると、該当 VTuber の詳細ページへ遷移する。
    - 配信カードのチャンネル名をタップすると詳細ページへ遷移し、動画プレーヤーは開かない。カード本体をタップした場合は従来どおり再生される。
    - 選択事務所フィルター、期間切替、お気に入りボタンの挙動が従来どおり。

- [ ] **AI-20261115. 配信タブのサブタブに件数バッジと「配信中」LIVE インジケーターを付ける**
  - **対象ファイル**:
    `components/StreamTabs.tsx`
    `FRONTEND_SPEC.md`
  - **背景**: data.vmato.jp は、配信一覧の見出しやタブで「いま何件が配信中か」「今日は何件配信予定か」がひと目で分かる。Vちゃんねるの配信タブ（5 サブタブ）は、ラベルだけで件数が分からない。そのため、タブを開くまで中身の有無が分からず、空のタブを何度も開く無駄が起きている。初回訪問者にとっては、いま配信中の動画があるかどうかも伝わりにくい。
  - **仕様**:
    - `StreamTabs` の各サブタブのラベル右に、件数バッジを小さく表示する。件数は、選択チャンネルの絞り込み後の件数にする（画面に出る一覧の件数と一致させる）。
      - 対象タブは「配信中」「今日の配信」「明日の配信」「明日以降の配信」。
      - 「過去アーカイブ」には付けない。サーバーで最大 60 件に絞っており、件数が実態を表さないため。
      - 件数 0 のタブにはバッジを出さない。ラベルは `text-zinc-400` 系にして、空であることを控えめに示す（選択中のタブは通常色のまま）。
      - 100 件以上は `99+` と表示する。
    - 「配信中」タブは、件数が 1 以上のときに、ラベルの左に赤いドット（`size-2 rounded-full bg-red-500`）を出す。`animate-pulse` を使うが、`motion-reduce:animate-none` で動きを止められるようにする。
    - バッジの見た目:
      - 非選択タブ: `rounded-full bg-zinc-100 px-1.5 text-[10px] font-semibold tabular-nums text-zinc-600`（ダーク: `dark:bg-zinc-800 dark:text-zinc-300`）。
      - 選択中タブ: 既存の選択色に合わせ、`bg-white/20 text-white` など、背景とコントラストが取れる配色にする。
      - 横スクロールのタブ列で、バッジを足してもタブの高さが変わらず、折り返さないこと（`whitespace-nowrap`、`shrink-0`）。
    - 件数は、タブの抽出ロジックと同じ配列から `.length` で求める。件数を数えるための二重のフィルタ処理は書かない。すでにタブごとに計算済みの配列があればそれを使い、無ければ `useMemo` でまとめて 1 回計算する。
    - アクセシビリティ: タブの `aria-label` は `配信中 3件` のように件数を含める。バッジ本体は `aria-hidden="true"` にして二重読み上げを避ける。
    - 既存のタブの順序、初期表示（「配信中」）、空表示の文言、タップのみ（スワイプ無効）の挙動は変えない。
    - サーバーから渡すデータは増やさない（新しい props は追加しない）。`/` の HTML サイズは増やさない。
    - `FRONTEND_SPEC.md` 5.2 に「サブタブに件数バッジ（絞り込み後の件数。過去アーカイブは対象外）と、配信中があるときの赤いドットを出す」旨を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 配信中の動画があるとき、「配信中」タブに赤いドットと件数バッジが出る。動画が 0 件のタブにはバッジが出ない。
    - フィルターで 1 事務所だけを選ぶと、バッジの件数が、そのタブに表示される動画数と一致する。
    - 375px 幅で 5 つのサブタブが横スクロールのまま崩れず、タブの高さが変わらない。ダークモードでも読める。
    - `curl -s <URL>/ -o top.html && wc -c top.html` が変更前と比べて +2KB 以内。

- [ ] **AI-20261116. 配信カードに「あと N 分で開始」「開始から N 時間」の相対時刻バッジを付ける**
  - **対象ファイル**:
    `components/VideoCard.tsx`
    `components/RelativeStartBadge.tsx`（新規・Client Component）
    `lib/relative-time.ts`（新規・純粋関数）
    `lib/stream.ts`（`toStreamCardVideo` に開始時刻が無い場合のみ。下記参照）
    `FRONTEND_SPEC.md`
  - **背景**: data.vmato.jp の配信一覧は「あと何分で始まるか」「始まってどれくらい経つか」がカード上で分かる。Vちゃんねるの配信カードは絶対時刻（日時）しか出さない。そのため次の問題がある。
    - 「今日の配信」では、時刻を現在時刻と見比べて計算する必要がある。
    - 「配信中」では、見始めて間に合うか（序盤か終盤か）が分からない。
    - 開始直前の配信を見つけにくく、再訪やタップのきっかけが弱い。
  - **仕様**:
    - `lib/relative-time.ts` に純粋関数 `getStreamRelativeLabel(v: { scheduledStartTime?: string; actualStartTime?: string; actualEndTime?: string }, live: boolean, now: Date): { text: string; tone: "soon" | "live" | "normal" } | null` を追加する。
      - `live === true` かつ `actualStartTime` が有効な日時で、現在より前の場合は、経過時間から `開始から N分`（60 分未満）または `開始から N時間M分`（60 分以上。M が 0 なら `N時間`）を返す。`tone` は `"live"`。
      - `live === false` で `actualEndTime` が空、かつ `scheduledStartTime` が有効で現在より後の場合を扱う。
        - 差が 60 分未満なら、`あと N分`（N は切り上げ、最小 1）を `tone: "soon"` で返す。
        - 60 分以上 6 時間未満なら、`あと N時間M分`（M が 0 なら `あと N時間`）を `tone: "normal"` で返す。
        - 6 時間以上先は `null`（既存の日時表示で十分なため）。
      - 開始予定時刻を過ぎていて `live` でない場合は `null`。日時が不正な場合も `null`。`Date.now()` は関数内で使わず、必ず引数 `now` を使う。
    - `RelativeStartBadge`（Client Component）を作る。
      - Props: `video`（上記 3 フィールド）, `live: boolean`。
      - **マウント後にだけ描画する**。マウント前は `null`（トップは ISR でキャッシュされた HTML のため、サーバーの現在時刻とずれてハイドレーションの不一致を起こさないようにする）。
      - 現在時刻は 60 秒ごとに更新する。タイマーはカードごとに持たず、モジュール内で共有する。`useSyncExternalStore` を使い、購読者が 0 になったら `setInterval` を止める。タブが非表示（`document.visibilityState === "hidden"`）の間は更新しない。復帰時は即座に 1 回更新する。
      - 見た目: `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap`。
        - `soon`: `bg-amber-100 text-amber-800`（ダーク: `dark:bg-amber-900/30 dark:text-amber-300`）。lucide-react の `Clock` `size={11}` を先頭に付ける。
        - `live`: `bg-red-100 text-red-700`（ダーク: `dark:bg-red-900/30 dark:text-red-300`）。
        - `normal`: `bg-zinc-100 text-zinc-600`（ダーク: `dark:bg-zinc-800 dark:text-zinc-300`）。
      - `getStreamRelativeLabel` が `null` のときは何も出さない。
    - `VideoCard` の既存の日時表示の近くにバッジを置く。
      - サムネイルへの重ね置きはしない。メタ情報の行に並べ、折り返し可（`flex-wrap gap-x-2 gap-y-1`）にする。
      - 動画への `<a>` の内側・外側のどちらでもよいが、タップ動作（再生）と他のリンクを変えない。
      - 対象は、配信中・今日の配信・明日の配信・明日以降の配信のカード。過去アーカイブ、お気に入り、VTuber 詳細の動画一覧には出さない。
      - 表示対象かどうかの判定は `getStreamRelativeLabel` の戻り値に任せる。ただし、バッジの有無でカードの高さが変わらないよう、メタ情報の行の最小高さを固定する（`min-h-5`）。
    - `StreamCardVideo`（`toStreamCardVideo` の戻り値）に `scheduledStartTime` / `actualStartTime` / `actualEndTime` が無い場合だけ、この 3 つを追加する。
      - すでにあればそのまま使う。他のフィールドは追加しない。
      - 追加したときも `/` の HTML は変更前から +5KB 以内に収める。
    - `any` は使わない。新しいパッケージは追加しない。
    - `FRONTEND_SPEC.md` 5.2 に次を追記する。
      - 配信カードに相対時刻バッジを出す（`あと N分`＝開始前 60 分未満は amber、`あと N時間M分`＝6 時間以内、`開始から N分/N時間M分`＝配信中は赤）。
      - 表示はマウント後にクライアントで計算し、60 秒ごとに更新する。
      - 過去アーカイブ・お気に入り・VTuber 詳細には出さない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 配信中タブのカードに `開始から N分/N時間M分` の赤バッジが出る。今日の配信タブで開始 60 分以内のカードには `あと N分` の amber バッジが出る。6 時間より先のカードにはバッジが出ない。
    - 約 1 分待つと、ページを再読み込みしなくてもバッジの分数が更新される。タブを別のタブに切り替えている間は更新されず、戻ると即座に更新される。
    - `curl -s <URL>/ -o top.html && wc -c top.html` が変更前から +5KB 以内。ブラウザのコンソールにハイドレーションの警告が出ない。
    - 375px 幅でカードのレイアウトが崩れない。ダークモードで読める。バッジの有無でカードの高さが変わらない。
    - タップによる動画再生、お気に入りボタン、`感想を書く` リンク（CHAT-7）、選択事務所フィルターの挙動が従来どおり。

- [x] ~~**AI-20261117. ニュース一覧に「媒体チップ」と「動画あり」の絞り込みを付ける**~~ 廃止（2026-11-19、P1-NEWS の NEWS-2 のカテゴリチップに置き換え。以下の本文は参考）
  - **対象ファイル**:
    `components/NewsList.tsx`（ニュース一覧を描画している Client Component。ファイル名が異なる場合は `app/news/page.tsx` から辿って該当ファイルを修正する）
    `lib/news.ts`（媒体名の正規化と集計の純粋関数を追加する。無ければ新規作成）
    `FRONTEND_SPEC.md`（5.3）
  - **背景**: data.vmato.jp は、ニュースを情報源や種類で切り替えて読める。Vちゃんねるのニュースは `news.json` の順に全件を縦に並べるだけで、絞り込み手段がない（現行仕様は「検索・カテゴリ絞り込みなし」）。そのため次の問題がある。
    - 特定の媒体の記事や、解説動画つきの記事だけを読みたい人が、全件をスクロールして探すことになる。
    - 記事が増えるほど一覧が長くなり、離脱しやすい。
  - **仕様**:
    - `lib/news.ts` に次の純粋関数を追加する。
      - `normalizeNewsSource(n: { channel?: string; sourceName?: string }): string`。表示名と同じ規則で媒体名を返す（`channel` が空、または `YouTube` などで媒体名として使えない場合は、既存のカード表示と同じ「ブログ記事」にそろえる）。
      - `summarizeNewsSources(items): { name: string; count: number }[]`。媒体名ごとの件数を、件数の多い順（同数なら初出順）に返す。
    - ニュース一覧の上、カード群の前に、横スクロールのチップ列を置く。
      - 先頭は `すべて`、続けて `動画あり`（`videoUrl` を持つ記事だけ。1 件以上あるときだけ表示）、続けて媒体名チップ（件数の上位 8 媒体まで。それ以外の媒体は `すべて` でのみ表示）。
      - 各チップは `名前 + 件数` を表示する（例: `ブログ記事 12`）。件数は `tabular-nums`。
      - 選択はラジオ的に 1 つだけ。初期値は `すべて`。選択状態は `useState` で持ち、保存はしない。
      - 見た目は、`rounded-full border px-3 py-1 text-xs whitespace-nowrap shrink-0`、非選択は `border-zinc-200 text-zinc-600`（ダーク: `dark:border-zinc-700 dark:text-zinc-300`）、選択中は violet 系の塗り（`bg-violet-600 text-white border-violet-600`）。
      - `role="tablist"` ではなく、`aria-pressed` を使うトグルボタンにする。
      - 横スクロール領域はページ全体の横スクロールを発生させない（`overflow-x-auto`、`-mx-4 px-4` など）。375px 幅で崩れないこと。
    - 絞り込みは、`news.json` の並び順を保ったまま `filter` する。フロントで再ソートしない。
    - 絞り込み後が 0 件のときは `該当するニュースがありません` と、`すべて表示に戻す` ボタンを出す。
    - 絞り込みを切り替えても、ニュースの取得（再 fetch）はしない。取得済みの配列から `useMemo` で求める。
    - チップ列の下に、現在の表示件数を `text-xs text-zinc-500` で `N件` と表示する。
    - 既存のローディング表示、エラー表示（`再読み込み`）、カードのリンク先や見た目、動画導線の挙動は変えない。
    - サーバーから渡すデータ・props は増やさない（`/news` の HTML サイズを増やさない）。`any` は使わない。新しいパッケージは追加しない。
    - `FRONTEND_SPEC.md` 5.3 の「検索・カテゴリ絞り込みなし」を、「媒体名チップ（件数付き、上位 8 媒体）と `動画あり` で絞り込める。並び順は `news.json` のまま」に書き換える。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/news` の上部にチップ列が出る。媒体チップをタップすると、その媒体の記事だけが `news.json` の順で表示され、件数表示と一致する。
    - `動画あり` を選ぶと、`videoUrl` を持つ記事だけが表示される。`すべて` に戻すと全件に戻る。
    - 絞り込みを切り替えても `news.json` への追加リクエストが発生しない（DevTools の Network で確認）。
    - 375px 幅でチップ列が横スクロールし、ページ全体の横スクロールが出ない。ダークモードで読める。
    - `curl -s <URL>/news -o news.html && wc -c news.html` が変更前から +2KB 以内。

- [ ] **AI-20261118. 配信中タブに並び替えチップ（視聴者数順／開始が新しい順）を付ける**
  - **対象ファイル**:
    `components/StreamTabs.tsx`
    `lib/stream.ts`（並び替えの純粋関数 `sortLiveVideos` を追加。`toStreamCardVideo` に `actualStartTime` が無い場合のみ追加）
    `FRONTEND_SPEC.md`（5.2）
  - **背景**: data.vmato.jp は、いま配信中の動画を同時視聴者数の多い順に見られる。Vちゃんねるの「配信中」タブは `livevideoList.json` の順序のままで、並び替え手段がない。そのため次の問題がある。
    - 「いま一番盛り上がっている配信」を探すには、一覧を最後までスクロールして `concurrent_viewers` を目で比べる必要がある。
    - 始まったばかりの配信（途中参加しやすい配信）を探せない。
    - 配信中は 1 日の中でもっとも見られるタブなので、ここで目的の配信に早く着けるかが回遊に直結する。
  - **仕様**:
    - `lib/stream.ts` に `sortLiveVideos<T extends { concurrent_viewers?: string | number; actualStartTime?: string }>(items: readonly T[], mode: "default" | "viewers" | "newest"): T[]` を追加する。元の配列は変更しない。
      - `default`: 渡された順序のまま返す。
      - `viewers`: `Number(concurrent_viewers)` の降順。数値化できない値・空は 0 として扱い、最後にまとめる。同数は元の順序を保つ（安定ソート）。
      - `newest`: `actualStartTime` の新しい順。日時が無い・不正なものは最後にまとめ、同時刻は元の順序を保つ。
    - `StreamTabs` の「配信中」タブだけ、一覧の上に並び替えチップを横並びで置く。
      - チップは `おすすめ`（= `default`）/ `視聴者数順` / `開始が新しい順` の 3 つ。初期値は `おすすめ`（従来の順序）。
      - 配信中の動画（選択チャンネル絞り込み後）が 2 件未満のときは、チップ列を出さない。
      - 選択状態は `useState` で持つ。保存はしない。タブを切り替えて戻ってきても、同じ画面を開いている間は維持する。
      - 更新ボタン・引っ張って更新・自動更新で `load()` が再実行されても、選択中の並び替えは変えない。
      - 並び替えは取得済みの配列に対して `useMemo` で行う。再 fetch はしない。選択チャンネルの絞り込み後に並び替える。
      - 見た目は、`rounded-full border px-3 py-1 text-xs whitespace-nowrap shrink-0`。非選択は `border-zinc-200 text-zinc-600`（ダーク: `dark:border-zinc-700 dark:text-zinc-300`）、選択中は `bg-violet-600 text-white border-violet-600`。先頭に小さく lucide-react の `ArrowDownWideNarrow`（`size={12}`）を付けた `並び替え` ラベル（`text-xs text-zinc-500`）を置く。
      - チップ列は `overflow-x-auto` で、375px 幅でもページ全体の横スクロールを出さない。`aria-pressed` を使うトグルボタンにする（`role="tablist"` にしない）。
    - 他のタブ（過去アーカイブ・今日・明日・明日以降）の並び順と表示は変えない。
    - `toStreamCardVideo` の戻り値に `actualStartTime` が無い場合だけ追加する（すでにあればそのまま使う。他のフィールドは追加しない）。追加後も `/` の HTML 増加は +3KB 以内に収める。
    - 同時視聴者数の表示（`concurrent_viewers` 付き）、お気に入り、`感想を書く` リンク、選択チャンネル絞り込みの挙動は変えない。
    - `any` は使わない。新しいパッケージは追加しない。
    - `FRONTEND_SPEC.md` 5.2 の「配信中」の行（`JSON の順序で一覧表示`）に、「初期は JSON の順序。一覧の上の並び替えチップで `視聴者数順` / `開始が新しい順` に切り替えられる（保存しない）」を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 配信中タブで `視聴者数順` を選ぶと、`concurrent_viewers` の多い順にカードが並ぶ。`開始が新しい順` では `actualStartTime` の新しい順に並ぶ。`おすすめ` に戻すと従来の順序に戻る。
    - 並び替えを切り替えても `/api/streams` への追加リクエストが発生しない（DevTools の Network で確認）。更新ボタンで再取得しても選択中の並び替えが変わらない。
    - フィルターで 1 事務所だけ選んだ状態でも、絞り込み後の一覧が並び替わる。配信中が 1 件以下のときはチップ列が出ない。
    - 他のサブタブの並び順が変わらない。
    - 375px 幅でチップ列が横スクロールし、ページ全体の横スクロールが出ない。ダークモードで読める。
    - `curl -s <URL>/ -o top.html && wc -c top.html` が変更前から +3KB 以内。

- [ ] **AI-20261119-15. トップページ最上部に「今日が誕生日のVTuber」帯を出し、詳細・日付ページへの回遊を作る**
  - **対象ファイル**:
    `lib/events-data.ts`（`getUpcomingBirthdays` を追加）
    `components/TodayBirthdayStrip.tsx`（新規・Client Component）
    `app/page.tsx`（配信タブの直前に設置。`<Suspense>` で包む）
    `lib/thumbnail.ts`（既存の `ytThumbUrl` を利用）
    `FRONTEND_SPEC.md`（5.2 とアプリシェル周辺）
  - **背景**: トップページは配信タブだけで、配信が少ない時間帯は「今日このサイトを開く理由」が弱い。誕生日は `eventList.json` に入っており、ファンの関心が高く、`/events/MM-DD` や VTuber 詳細への内部リンクも増やせる。ところが現状、誕生日はイベントカレンダーを開かないと見えない。
  - **仕様**:
    - `lib/events-data.ts` に `getUpcomingBirthdays(days = 4)` を追加する。`"use cache"` + `cacheLife("hours")` を付け、JST の今日から `days` 日分について、誕生日（`eventType === "birthday"`）だけを次の形で返す。
      - `{ slug: "MM-DD"; month: number; day: number; total: number; people: { channelId: string; name: string; thumb?: string }[] }[]`
      - `people` は最大 5 人。`total` は人数の合計。`thumb` は `shortenYtThumb()` で短縮した形にする。
      - 並びは `eventList.json` の順とする。既存の `getEventsMap()` の結果を再利用し、新しい GCS 取得は増やさない。
      - 取得に失敗したときは空配列を返し、トップページを落とさない。
    - ISR のキャッシュが日付をまたいで残っても正しく動くよう、`app/page.tsx` は今日 1 日分ではなく 4 日分をクライアントへ渡す。
    - `TodayBirthdayStrip`（Client Component）はマウント後に JST の今日（`lib/events.ts` の `todayJstParts()`）と一致する `slug` を探して表示する。
      - マウント前は何も描画しない。ハイドレーションの不一致を避けるため。
      - 配置は 1 行分の高さ（`min-h-14`）を確保した枠の中とし、CLS を出さない。
      - 当日が 0 人なら枠ごと出さない。
    - 見た目は、`rounded-xl border border-amber-200 bg-amber-50 px-3 py-2`（ダーク: `dark:border-amber-900/50 dark:bg-amber-950/20`）の細い帯とする。
      - 左に lucide-react の `Cake`（`size={16}`）と `今日は{total}人の誕生日`（`text-sm font-semibold`）を置く。
      - その右に VTuber のアイコン（`SafeImage`、`ytThumbUrl(thumb, 48)`、`size-8 rounded-full`、`loading="lazy"`）を最大 5 つ並べる。各アイコンは `next/link` の `<Link href={`/vtuber/${channelId}`} title={name}>` にする。
      - `thumb` が無い場合は名前の頭文字の丸を出す。
      - 末尾に `total > 5` なら `ほかN人` を出す。
      - 右端に `すべて見る` のリンク（`/events/{slug}`、`text-xs text-blue-600`、`ChevronRight` 付き）を置く。
      - 375px 幅ではアイコン列を `overflow-x-auto`（スクロールバー非表示）にして、帯が 2 行以上にならないようにする。ページ全体の横スクロールを出さない。
    - 帯は絞り込み（選択チャンネル）の影響を受けない。
    - リンクはすべて `<Link>`（`<a href>`）とし、`onClick` だけの遷移にはしない。
    - `app/page.tsx` の `generateMetadata`、ISR 設定、`loading.tsx`、配信タブの表示は変えない。`any` は使わない。新しいパッケージは追加しない。
    - `FRONTEND_SPEC.md` 5.2 に「トップ最上部に今日の誕生日帯（JST、マウント後に判定、最大 5 人＋ほか N 人、`/events/MM-DD` へリンク、0 人の日は出さない）」を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。ビルドログに `Date.now()` の警告が出ない。
    - 誕生日の VTuber がいる日にトップを開くと、配信タブの上に帯が出る。アイコンをタップすると `/vtuber/{channelId}` へ、`すべて見る` をタップすると `/events/MM-DD` へ遷移する。
    - 誕生日が 0 人の日は帯が出ず、空白の枠も残らない（CLS が出ない）。
    - `curl -s <URL>/ -o top.html && wc -c top.html` が変更前から +3KB 以内で、500KB 以下のまま。ブラウザのコンソールにハイドレーションの警告が出ない。
    - 375px 幅で帯が 1 行に収まり、横スクロールが出ない。ダークモードで読める。配信タブ、フィルター、更新ボタンの挙動は従来どおり。

- [ ] **AI-20261119-21. お気に入りボタンのハートを一覧側で押しやすくし、「お気に入り件数」をヘッダーのお気に入りリンクに表示する**
  - **対象ファイル**:
    `components/AppShell.tsx`（ヘッダーのお気に入りリンクにバッジを追加）
    `hooks/useFavorites.ts`（既存のお気に入り状態フックがあればそれを使う。無ければ `FavoriteVideoData` 相当の読み取り専用フックを新規作成）
    `components/FavoriteCountBadge.tsx`（新規・Client Component）
    `FRONTEND_SPEC.md`（5.0 と 5.8）
  - **背景**: data.vmato.jp は、保存した配信・動画の数がナビ上で常に見える。Vちゃんねるはお気に入り動画を localStorage に保存できるが、保存した件数がどこにも出ない。そのため次の問題がある。
    - 動画をお気に入りに入れても、保存できたかどうかが一覧上で実感しにくい。
    - お気に入りページ（`/favorites`）へ戻る動機が弱く、再訪のきっかけになっていない。
  - **仕様**:
    - `FavoriteCountBadge`（Client Component）を作り、`favorites`（videoID の配列。localStorage）の件数を表示する。
      - 件数は既存のお気に入り状態（Provider またはフック）から取得する。新しい保存キーは作らない。
      - 同じタブ内でお気に入りを追加・削除したときに即座に件数が変わること。別タブでの変更は `storage` イベントで反映する。
      - **マウント後にだけ描画する**。マウント前は `null`（SSR/ISR の HTML と localStorage の値がずれて、ハイドレーションの不一致が起きないようにするため）。
      - 0 件のときは何も出さない。100 件以上は `99+` と表示する。
    - `AppShell` のヘッダーにあるお気に入りリンク（`/favorites`）のアイコンの右上に、バッジを重ねて置く。
      - 見た目は `absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white tabular-nums`。リンク側は `relative` にする。
      - バッジ本体は `aria-hidden="true"`。リンクの `aria-label` を `お気に入り（N件）` のように件数を含める。0 件のときは従来どおり `お気に入り`。
      - 件数が増えた瞬間だけ、バッジを軽く拡大して戻す（`animate-[ping_...]` ではなく、`transition-transform` と `scale-125` を 200ms 使う）。`motion-reduce:transition-none` で止められるようにする。
    - リンク先・アイコン・`useLinkStatus` による押下中表示（NAV-2）・フィルターチップなどのヘッダーの既存の挙動は変えない。
    - 375px 幅でヘッダーが折り返さず、バッジが他のアイコンやフィルターチップと重ならないこと。ダークモードで読めること。
    - サーバーから渡すデータ・props は増やさない（全ページの HTML サイズを増やさない）。`any` は使わない。新しいパッケージは追加しない。
    - `FRONTEND_SPEC.md` 5.0 のヘッダー導線に「お気に入りリンクに件数バッジ（マウント後に表示、0 件は非表示、99+ 表記）」を、5.8 に「ヘッダーのバッジで件数を確認できる」旨を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 配信カードのお気に入りボタンを押すと、ヘッダーのお気に入りアイコンのバッジが 1 増える。解除すると 1 減り、0 件になるとバッジが消える。
    - 別タブでお気に入りを変更すると、もう一方のタブのバッジも更新される。
    - `curl -s <URL>/ -o top.html && wc -c top.html` が変更前から +1KB 以内。ブラウザのコンソールにハイドレーションの警告が出ない。
    - 375px 幅・ダークモードでヘッダーが崩れない。お気に入りページ・お気に入りの追加削除の動作は従来どおり。

- [ ] **AI-20261120-02. 配信タブにキーワード検索（タイトル・チャンネル名）を付ける**
  - **対象ファイル**:
    `components/StreamTabs.tsx`
    `lib/search.ts`（既存の `normalizeForSearch()` を利用。変更は不要）
    `lib/stream.ts`（絞り込み用の純粋関数 `filterStreamsByKeyword` を追加）
    `FRONTEND_SPEC.md`（5.2）
  - **背景**: data.vmato.jp は、配信一覧を VTuber 名やキーワードで探せる。Vちゃんねるの配信タブには検索手段がなく、特定の VTuber や企画の配信を見つけるには、5 つのサブタブを順に開いてスクロールするしかない。「ぺこらの今日の配信」「歌枠」のような目的買いの訪問は多いが、いまはフィルターで事務所や人を選び直す手間が必要。フィルターは保存される設定なので、一時的に探す用途には重い。
  - **仕様**:
    - `lib/stream.ts` に純粋関数 `filterStreamsByKeyword<T extends { title?: string; channelTitle?: string }>(items: readonly T[], keyword: string): T[]` を追加する。
      - `normalizeForSearch()` で正規化したキーワードを、`title` と `channelTitle` を連結して正規化した文字列に対する部分一致で照合する。
      - キーワードが空（空白のみを含む）なら、渡された配列をそのまま返す。
      - 元の並び順を保ち、元の配列は変更しない。
      - 空白区切りの複数語は AND で照合する（例: `ぺこら 歌枠`）。
    - `StreamTabs` のサブタブ列の下、一覧の上に検索欄を 1 つ置く。5 つのサブタブすべてで共通に使う。
      - `type="search"`、左に lucide-react の `Search`（`size={16}`）、placeholder `タイトル・チャンネル名で探す`、`aria-label="配信をキーワードで探す"`。
      - 入力があるときだけ右端に `X`（lucide-react）のクリアボタンを出す。`Esc` キーでも空にする。
      - iOS Safari で入力時にズームされないよう、入力欄の文字サイズは 16px 以上にする（`text-base`）。見た目の高さは `h-10` 程度に収める。
      - 入力値は `useState` で持ち、保存しない。サブタブを切り替えても維持する。
      - 絞り込みは `useDeferredValue` で遅延させ、入力中の描画を重くしない。
    - 絞り込みの順序は「選択チャンネルでの絞り込み → サブタブの抽出条件 → キーワード」とする。
      - 取得済みの配列に `useMemo` で適用する。再 fetch はしない。
      - 更新ボタン・引っ張って更新・自動更新で `load()` が再実行されても、入力中のキーワードは消さない。
      - 時間帯別グルーピング（今日・明日）は、キーワード適用後の動画で作る。動画が 0 件の時間帯の見出しは出さない。
    - **件数バッジとの関係**: サブタブの件数バッジ（AI-20261115 を実装済みの場合）は、キーワードの影響を受けない（選択チャンネル絞り込み後の件数のまま）。実装されていなければ何もしない。
    - **結果の表示**:
      - キーワードが入力されているとき、検索欄の下に `text-xs text-zinc-500` で `現在のタブ N件 / 他のタブ M件` を表示する。M は他のサブタブのヒット件数の合計。
      - 現在のタブが 0 件で他のタブにヒットがある場合は、空表示の文言の代わりに `「{keyword}」に一致する配信はこのタブにありません（他のタブに M件）` を出す。
      - 全タブで 0 件のときは `「{keyword}」に一致する配信はありません` と、`検索をクリア` ボタンを出す。
      - 「過去アーカイブ」タブでは、検索欄の下に `過去アーカイブは直近の最大60件が対象です` と `text-xs text-zinc-400` で補足する（サーバーで 60 件に絞っているため）。
    - 既存のサブタブの順序・初期表示（配信中）・タップのみ（スワイプ無効）・空表示の文言（キーワードなしのとき）・お気に入り・`感想を書く`・並び替えチップ（AI-20261118 を実装済みの場合は、キーワードで絞った結果に並び替えを適用する）の挙動は変えない。
    - 引っ張って更新のタッチ処理は、検索欄にフォーカスがある間は発火させない。
    - サーバーから渡すデータ・props は増やさない。`/` の HTML サイズは増やさない。`any` は使わない。新しいパッケージは追加しない。
    - ダークモード対応。375px 幅で検索欄とサブタブ列が重ならず、ページ全体の横スクロールが出ない。
    - `FRONTEND_SPEC.md` 5.2 に次を追記する。
      - サブタブ列の下にキーワード検索欄を置く。対象はタイトルとチャンネル名で、`normalizeForSearch()` による正規化、空白区切り AND、保存しない。
      - 他のタブのヒット件数を併記する。過去アーカイブは直近 60 件のみが対象。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - 「ぺこら」と「ペコラ」のどちらでも、同じ配信がヒットする。`ぺこら 歌枠` のように 2 語を入れると両方を含む配信だけが残る。
    - サブタブを切り替えてもキーワードが維持され、現在のタブが 0 件で他のタブにヒットがある場合は、その旨と件数が表示される。
    - 更新ボタンで再取得してもキーワードが消えない。DevTools の Network で、入力中に `/api/streams` への追加リクエストが発生しない。
    - 検索欄にフォーカスして下に引っ張っても、引っ張って更新が誤発火しない。
    - 375px 幅・ダークモードで崩れない。iOS Safari で入力時にページが拡大されない。
    - `curl -s <URL>/ -o top.html && wc -c top.html` が変更前から +2KB 以内。

- [ ] **AI-20261120-15. VTuber 詳細ページに「配信中／次の配信予定」カードを出す**
  - **対象ファイル**:
    `components/VTuberUpcomingStreams.tsx`（新規・Client Component）
    `app/api/streams/route.ts`（`channelId` クエリの追加のみ）
    `lib/stream.ts`（チャンネルで絞る純粋関数 `pickChannelStreams` を追加）
    `app/vtuber/[channelId]/page.tsx`（`DetailView` の直後に設置）
    `FRONTEND_SPEC.md`（5.2 と 5.4）
  - **背景**: data.vmato.jp は、VTuber 個別の画面から「いま配信中か」「次はいつ配信するか」をすぐ確認できる。Vちゃんねるの詳細ページ（`/vtuber/[channelId]`）は `"use cache"` で 1 時間キャッシュされており、「最新動画」はあっても、配信中の表示や今後の予定は出ない。検索から詳細ページに来た人は、推しが今配信しているかを知るためにトップの配信タブへ戻り、一覧から探し直す必要がある。配信中や予定が分かれば、詳細ページから動画の再生につながり、滞在と再訪が増える。
  - **仕様**:
    - `lib/stream.ts` に純粋関数 `pickChannelStreams<T extends { channelId?: string }>(live: readonly T[], upcoming: readonly T[], channelId: string): { live: T[]; upcoming: T[] }` を追加する。
      - `channelId` が一致するものだけを返し、元の並び順を保つ。元の配列は変更しない。
      - `channelId` が空文字なら、両方とも空配列を返す。
    - `/api/streams` に任意のクエリ `channelId` を追加する。
      - 形式は `^[A-Za-z0-9_-]{1,64}$` のみ許可し、不正値は 400 を返す。
      - 指定があるときは、`liveVideos` を `channelId` で絞る。`allVideos` は `comparisonDay` が今日以降（JST）のもので、同じ `channelId` のものだけに絞って返す。過去アーカイブは返さない。
      - 指定がないときの挙動とレスポンスの形は、既存のまま変えない。
      - `Cache-Control: no-store` を維持する。
    - `components/VTuberUpcomingStreams.tsx` は、`channelId` を props で受け取る。
      - マウント後に 1 回だけ `fetch(`/api/streams?channelId=${channelId}`, { cache: "no-store" })` する。
      - 表示は `pickChannelStreams` の結果を使う。取得失敗、または配信中・予定とも 0 件のときは `null` を返し、何も表示しない（エラー文言は出さない）。
      - 表示するのは、配信中があれば最大 2 件、予定は開始が近い順に最大 3 件とする。
      - 画面の表示中は 3 分ごとに再取得する。非表示中は取得しない。`visibilitychange` で復帰したときは、最終取得から 60 秒以上たっていれば再取得する（トップの配信タブと同じ方針）。
      - 各動画は、既存の `VideoCard` を使って表示する。カードの再生・お気に入りの動作は既存のままにする。`VideoCard` の props は既存の使い方に合わせ、新しい props は足さない。
    - 見出しとレイアウトは次のとおり。
      - セクション全体は `<section aria-label="配信情報" className="mt-6">` にする。
      - 配信中があるときは、見出し `配信中`（`text-base font-bold`）の左に赤いドット（`size-2 rounded-full bg-red-500 animate-pulse motion-reduce:animate-none`）を置く。
      - 予定があるときは、見出し `次の配信予定`（`text-base font-bold`）。見出しの横に lucide-react の `CalendarClock`（`size={16}`）を置く。
      - 配信中と予定の両方があるときは、配信中を上に、予定を下にする。
      - カードの並びは、画面幅 600px 以上で 2 列、それ未満で 1 列にする。
      - ダークモードに対応する。375px 幅でページ全体の横スクロールを出さない。
    - `app/vtuber/[channelId]/page.tsx` では、`<DetailView>` の直後（掲示板カードの前）に `<VTuberUpcomingStreams channelId={channelId} />` を置く。
      - サーバー描画の HTML にこのセクションは含めない。表示はマウント後のクライアント取得のみとする。キャッシュ済みの詳細ページと、配信の鮮度を分けるため。
      - ページの `"use cache"`、`generateMetadata`、JSON-LD、`loading.tsx` は変えない。`Date.now()` をプリレンダー中に使わない。
    - `/vtuber` のタブ UI の詳細（`DetailView` を使う箇所）には出さない。詳細ページ（`/vtuber/[channelId]`）だけで先行して導入する。
    - `any` は使わない。新しいパッケージは追加しない。
    - `FRONTEND_SPEC.md` に次を追記する。
      - 5.2: `/api/streams?channelId=` のクエリ仕様（形式チェック、絞り込み対象、過去アーカイブは返さない）。
      - 5.4: `/vtuber/[channelId]` の `DetailView` の下に、配信中・次の配信予定のカードを出す。クライアントで取得し、0 件なら非表示。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。ビルドログに `Date.now()` の警告が出ない。
    - 配信中の VTuber の詳細ページを開くと、`配信中` の見出しと赤いドット、その配信のカードが表示される。カードをタップすると、トップの配信タブと同じ動作で動画が再生される。
    - 配信予定がある VTuber の詳細ページに `次の配信予定` が出る。配信中も予定もない VTuber のページには、何も出ず、空の枠も残らない。
    - `curl -s "<URL>/api/streams?channelId=abc<script>"` が 400 を返す。`curl -s "<URL>/api/streams"` は従来と同じ形のレスポンスを返す。
    - `curl -s <URL>/vtuber/<id> -o d.html && wc -c d.html` が変更前から +1KB 以内。`d.html` に `配信中` や `次の配信予定` の見出しが含まれない（クライアント描画のため）。ブラウザのコンソールにハイドレーションの警告が出ない。
    - 詳細ページを開いたまま画面を非表示にした間は、`/api/streams?channelId=` への再取得が発生しない。復帰時に最終取得から 60 秒以上たっていれば再取得される（DevTools の Network で確認）。
    - 375px 幅・ダークモードで崩れない。

- [ ] **AI-20261120-21. 予定の配信カードに「カレンダーに追加」を付ける（Google カレンダー／.ics）**
  - **対象ファイル**:
    `lib/calendar-link.ts`（新規・純粋関数）
    `components/AddToCalendar.tsx`（新規・Client Component）
    `components/VideoCard.tsx`
    `lib/stream.ts`（`toStreamCardVideo` に `scheduledStartTime` / `actualEndTime` が無い場合のみ追加）
    `FRONTEND_SPEC.md`（5.2）
  - **背景**: 通知スイッチはネイティブアプリ専用で、Web では「この配信を忘れずに見る」手段がない（5.2）。そのため、予定の配信を見つけても、後で見に来る動機が弱く、再訪が起きにくい。ほとんどの人が使っているカレンダーに予定を入れられれば、Web でも通知に近い体験を作れる。サーバー実装・ログイン・権限は不要で、既存のデータだけで実装できる。
  - **仕様**:
    - `lib/calendar-link.ts` に純粋関数を 2 つ追加する。現在時刻は使わない。
      - `buildGoogleCalendarUrl(v: { videoId: string; title: string; channelTitle?: string; startIso: string }): string | null`
        - `https://calendar.google.com/calendar/render?action=TEMPLATE` に `text`、`dates`（`YYYYMMDDTHHmmssZ/YYYYMMDDTHHmmssZ`、UTC）、`details` を付ける。各値は `encodeURIComponent` でエンコードする。
        - 終了時刻は、動画に終了予定が無いため開始の 1 時間後とする。
        - `text` は `【{channelTitle}】{title}`（`channelTitle` が空ならタイトルのみ）。`details` は `https://www.youtube.com/watch?v={videoId}` と、`Vちゃんねるから追加` の 2 行。
        - `startIso` が不正な日時、または `videoId` が空なら `null` を返す。
      - `buildIcsContent(同じ引数): string | null`
        - `BEGIN:VCALENDAR` / `VERSION:2.0` / `PRODID:-//Vchannel//JA` / `BEGIN:VEVENT`（`UID:{videoId}@vchannel`、`DTSTAMP`・`DTSTART`・`DTEND` は UTC、`SUMMARY`、`DESCRIPTION`、`URL`）/ `END:VEVENT` / `END:VCALENDAR` を、行区切り CRLF で返す。
        - テキスト値は `\`・`;`・`,`・改行をエスケープする。
        - `DTSTAMP` は引数 `startIso` を使わず、`opts.now: Date` を第 2 引数で受け取る。関数内で `Date.now()` は使わない。
        - 不正な入力は `null` を返す。
      - 単体テストは既存のテスト方式に合わせる。テスト基盤が無い場合は、一時スクリプト（コミットしない）で次を確認し、結果を PR 本文に貼る: 通常の入力、タイトルに `,` `;` 改行を含む入力、不正な日時。
    - `components/AddToCalendar.tsx`（Client Component）を作る。
      - Props: `video: { videoId: string; title: string; channelTitle?: string; scheduledStartTime?: string; actualEndTime?: string }`、`live: boolean`。
      - **マウント後にだけ描画する**。マウント前は `null`（トップは ISR でキャッシュされた HTML のため、現在時刻の判定でハイドレーションの不一致を起こさないようにする）。
      - 表示条件は次の 3 つをすべて満たすときだけ。条件を満たさなければ `null`。
        - `live === false`
        - `actualEndTime` が空
        - `scheduledStartTime` が有効な日時で、現在より後
      - 見た目は、カード下部の 1 行の小さなボタンとする。
        - ネイティブの `<details>` を使う。`<summary>` に、lucide-react の `CalendarPlus`（`size={14}`）と `カレンダーに追加` を入れる。
        - `<summary>` の文字は `text-xs font-medium text-zinc-600`（ダーク: `dark:text-zinc-300`）。`list-none` で標準の三角を消し、`hover:bg-zinc-50`（ダーク: `dark:hover:bg-zinc-900`）、`min-h-9`、`cursor-pointer`、`touch-manipulation` を付ける。
        - 開くと 2 項目を縦に並べる。
          - `Google カレンダー`: `<a href={buildGoogleCalendarUrl(...)} target="_blank" rel="noopener noreferrer">`。
          - `.ics をダウンロード（iPhone・Outlook など）`: `<button>`。押すと `buildIcsContent` の結果から `Blob`（`text/calendar;charset=utf-8`）を作り、`URL.createObjectURL` と一時的な `<a download="vtuber-stream-{videoId}.ics">` でダウンロードする。終了後に `URL.revokeObjectURL` を呼ぶ。
        - 項目を押したら `<details>` を閉じる。ほかの場所をタップしても閉じるようにする（`toggle` と外側クリックで `open` を外す）。
      - `any` は使わない。新しいパッケージは追加しない。
    - `components/VideoCard.tsx` の組み込みは次のとおり。
      - 動画への `<a>` の外側に `<AddToCalendar>` を置く。`live` のカードの `感想を書く` リンク（CHAT-7）と同じ位置・同じ区切り線のスタイル（`border-t border-zinc-100 dark:border-zinc-800`）にそろえる。
      - 動画のタップ（再生）、お気に入りボタン、`感想を書く` リンクの挙動は変えない。
      - 過去アーカイブ、お気に入りページ、VTuber 詳細の動画一覧には出さない（表示条件の「現在より後の予定」で自然に外れる）。
      - 条件を満たさないカードには、空の行を残さない。マウント後に行が増えてレイアウトがずれるのを防ぐため、`AddToCalendar` を出す可能性があるカード（`live` でないもの）のカード下部に `min-h-9` の領域をあらかじめ確保する。ただし、過去アーカイブなど表示条件を満たさないことが分かっているタブでは確保しない。
    - `toStreamCardVideo` の戻り値に `scheduledStartTime` / `actualEndTime` が無い場合だけ追加する。すでにあればそのまま使う（AI-20261116 で追加済みの場合も同様）。他のフィールドは追加しない。`/` の HTML 増加は +3KB 以内に収める。
    - 選択チャンネルの絞り込み、更新ボタン、引っ張って更新、自動更新の挙動は変えない。
    - ダークモード対応。375px 幅でカードのレイアウトが崩れず、メニューがカード外にはみ出して横スクロールを出さない。
    - `FRONTEND_SPEC.md` 5.2 に次を追記する。
      - 予定の配信カード（未来の `scheduledStartTime` があり、終了前で、配信中でないもの）に「カレンダーに追加」を出す。Google カレンダーのリンクと `.ics` のダウンロードの 2 種類。
      - 終了時刻は開始の 1 時間後で固定。表示はマウント後にクライアントで判定する。過去アーカイブ・お気に入り・VTuber 詳細には出さない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。ビルドログに `Date.now()` の警告が出ない。
    - 「今日の配信」「明日の配信」「明日以降の配信」の未来の予定カードに `カレンダーに追加` が出る。開始時刻を過ぎたカード、配信中、過去アーカイブには出ない。
    - `Google カレンダー` を押すと新しいタブで Google カレンダーの予定作成画面が開き、タイトル・日時（JST で正しい時刻）・YouTube の URL が入っている。
    - `.ics をダウンロード` を押すと `.ics` ファイルが保存され、iPhone のカレンダーまたは Outlook などで開くと、同じ日時・タイトルで 1 件の予定として登録できる。
    - タイトルに `,` `;` を含む動画でも、`.ics` が壊れずに取り込める。
    - カードのタップによる動画再生、お気に入り、`感想を書く` の挙動が従来どおり。
    - `curl -s <URL>/ -o top.html && wc -c top.html` が変更前から +3KB 以内。ブラウザのコンソールにハイドレーションの警告が出ない。
    - 375px 幅・ダークモードで崩れず、ページ全体の横スクロールが出ない。

- [ ] **AI-20261121-02. VTuber 詳細・日付別イベントページに「共有」ボタン（X で共有／リンクをコピー／端末の共有）を付ける**
  - **対象ファイル**:
    `components/ShareButtons.tsx`（新規・Client Component）
    `lib/share.ts`（新規・純粋関数）
    `app/vtuber/[channelId]/page.tsx`
    `app/events/[date]/page.tsx`
    `FRONTEND_SPEC.md`（5.4・5.7）
  - **背景**: 現状、詳細ページや日付ページを見た人が、推しの登録者数や「今日の誕生日」を X や LINE で友達に共有する導線が無い。URL を手で貼るしかなく、共有されないため、新しい流入が生まれない。検索流入がまだ少ない今、ファンの共有が最も低コストな流入源になる。サーバー実装や X API は不要で、既存データだけで作れる（X 投稿案 `/admin/x` は運営者用で、一般ユーザー向けの共有は無い）。
  - **仕様**:
    - `lib/share.ts` に純粋関数を追加する。現在時刻は使わない。
      - `buildXShareUrl(opts: { text: string; url: string }): string`
        - `https://x.com/intent/post?text=...&url=...` を返す。値は `encodeURIComponent` でエンコードする。`text` に URL は含めない。
      - `appendShareUtm(url: string, medium: "x" | "copy" | "native"): string`
        - `utm_source=share&utm_medium={medium}` を付ける。既にクエリがあれば `&` でつなぐ。不正な URL は入力をそのまま返す。
      - 単体テストは既存のテスト方式に合わせる。無ければ一時スクリプト（コミットしない）で、通常の URL、クエリ付き URL、日本語を含む `text` を確認し、結果を PR 本文に貼る。
    - `components/ShareButtons.tsx`（Client Component）を作る。
      - Props: `url: string`（サーバーで `SITE_URL` から作った絶対 URL。canonical と同じ）、`title: string`（端末の共有で使うタイトル）、`xText: string`（X に入れる本文）。
      - ボタンは横並びで 3 つ。`flex flex-wrap gap-2`。
        - `X で共有`: `<a href={buildXShareUrl({ text: xText, url: appendShareUtm(url, "x") })} target="_blank" rel="noopener noreferrer">`。lucide-react の `Share2`（`size={14}`）付き。
        - `リンクをコピー`: `<button type="button">`。lucide-react の `Link2`（`size={14}`）付き。押すと `navigator.clipboard.writeText(appendShareUtm(url, "copy"))` を呼ぶ。成功したら 2 秒間 `コピーしました`（`Check` アイコン）に替える。`clipboard` が使えない・失敗した場合は `コピーできませんでした` を 2 秒表示する。
        - `共有…`: `navigator.share` が使える端末（マウント後に判定）だけ表示する。押すと `navigator.share({ title, url: appendShareUtm(url, "native") })` を呼ぶ。ユーザーが共有をキャンセルしたとき（`AbortError`）は何も表示しない。
      - マウント前は `X で共有` と `リンクをコピー` だけを描画し、`共有…` はマウント後に追加する。サーバー HTML とずれないよう、`共有…` が増えても行の高さが変わらない作りにする（`min-h-9`）。
      - 見た目は、`rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 active:scale-[0.98] touch-manipulation`（ダーク: `dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900`）。
      - 結果のメッセージは `aria-live="polite"` の領域で通知する。ボタンのタップ領域は縦 36px 以上。375px 幅で折り返してもページ全体の横スクロールが出ない。
      - `any` は使わない。新しいパッケージは追加しない。
    - 設置:
      - `/vtuber/[channelId]`: h1 直下の要約文の下に、`<ShareButtons>` を 1 つ置く。
        - `xText` は `{表示名}のYouTube登録者数は約{formatCompact(登録者数)}人（{日付}時点）。登録者数の推移・誕生日・デビュー日をまとめています #VTuber`。表示名は CTR-1 の `displayVtuberName` を使い、日付は要約文と同じ取得データの最新日付から作る。
        - 登録者数が 0 のときは「YouTube登録者数は…」の文を省く。
        - `title` は `{表示名}の登録者数・配信情報`。
      - `/events/[date]`: 見出しと要約文の下に 1 つ置く。
        - `xText` は `{M}月{D}日が誕生日・デビュー記念日のVTuber（誕生日{n}人・周年{m}人） #VTuber`。0 人の日は人数の括弧を省く。
        - `title` は `{M}月{D}日が誕生日・デビュー記念日のVTuber`。
      - どちらも `url` は `lib/site.ts` の `SITE_URL` と該当パスから作る。URL を直書きしない。
    - ページの `"use cache"`、`generateMetadata`、JSON-LD、`loading.tsx` は変えない。プリレンダー中に `Date.now()` を使わない。
    - `rel="nofollow"` は付けない（外部リンクだが共有用。`noopener noreferrer` のみ）。
    - 共有リンクの UTM は `utm_source=share` を使う。運営者の X 投稿案が使う `utm_source=x` とは区別し、Vercel Analytics で内訳を見られるようにする。
    - `FRONTEND_SPEC.md` に次を追記する。
      - 5.4: 詳細ページの要約文の下に共有ボタン（X・コピー・端末の共有）を置く。文面の型、UTM（`utm_source=share&utm_medium=x|copy|native`）、`共有…` はマウント後にだけ出す。
      - 5.7: `/events/[date]` にも同じ共有ボタンを置く。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。ビルドログに `Date.now()` の警告が出ない。
    - `/vtuber/UC-hM6YJuNYVAmUWxeIr9FeA` の HTML に `x.com/intent/post` を含むリンクが 1 つあり、`url` パラメータが `https://www.vchannel.net/vtuber/UC-hM6YJuNYVAmUWxeIr9FeA?utm_source=share&utm_medium=x` をエンコードした形になっている（本番、またはローカルでは `SITE_URL` に合わせた値）。
    - `/events/11-20` などの日付ページにも同様に共有ボタンが出る。
    - `X で共有` を押すと新しいタブで X の投稿画面が開き、本文と URL が入っている。`リンクをコピー` を押すと `コピーしました` が出て、クリップボードに UTM 付きの URL が入る。
    - スマホ実機（iOS Safari または Android Chrome）では `共有…` が表示され、押すと端末の共有シートが開く。キャンセルしてもエラー表示が出ない。PC の非対応ブラウザでは `共有…` が出ない。
    - `curl -s <URL>/vtuber/<id> -o d.html && wc -c d.html` が変更前から +2KB 以内。ブラウザのコンソールにハイドレーションの警告が出ない。
    - 375px 幅・ダークモードで崩れず、ページ全体の横スクロールが出ない。

- [ ] **AI-20261121-09. VTuber 詳細ページの先頭に「登録者数 全体◯位／事務所内◯位」の順位チップを出す**
  - **対象ファイル**:
    `components/RankChips.tsx`（新規・Server Component 可。hooks を使わない純粋な表示コンポーネント）
    `app/vtuber/[channelId]/page.tsx`
    `FRONTEND_SPEC.md`（5.4）
  - **背景**: data.vmato.jp は、VTuber の個別画面で「登録者数が全体で何位か」がひと目で分かる。Vちゃんねるの詳細ページでは、順位が要約文と「よくある質問」の文章にしか出ない（IDX-1）。次の問題がある。
    - 訪問者が文章を読まないと順位が分からず、推しの位置づけを数字で実感しにくい。
    - 順位から `/ranking` へ移動する導線がなく、ランキングへの回遊が起きない。
    - 検索結果から着地した人が最初に知りたい「この人はどれくらい人気なのか」が、ファーストビューで伝わらない。
  - **仕様**:
    - `components/RankChips.tsx` を新規作成する。Props は次のとおり。
      - `overall: number`、`total: number`、`office?: string`、`inOffice?: number`、`officeTotal?: number`。
      - `getCachedVTuberRanks(channelId)` の戻り値（`{ overall; total; inOffice; officeTotal }`）をそのまま渡せる形にする。
    - チップは次の 1〜2 個を横並びで出す（`flex flex-wrap gap-2`）。
      - 全体順位: lucide-react の `Trophy`（`size={14}`）＋ `登録者数 全体{overall}位`、右に小さく `/{total}人`（`text-[11px] text-zinc-500 tabular-nums`）。
      - 事務所内順位: `office` が空でなく `個人` でもなく、`inOffice` と `officeTotal` があるときだけ。lucide-react の `Building2`（`size={14}`）＋ `{office}内 {inOffice}位`、右に小さく `/{officeTotal}人`。
      - `office === "個人"` のときは事務所内チップを出さない。
    - 見た目は次のとおり。
      - 共通: `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold`。
      - 通常: `border-zinc-200 bg-white text-zinc-700`（ダーク: `dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200`）。
      - 順位が 1〜3 位のチップ: `border-amber-300 bg-amber-50 text-amber-800`（ダーク: `dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300`）。
      - 事務所名は長いときに `truncate max-w-[14rem]` で省略し、チップが 375px 幅で 1 行を超えて崩れないようにする。
    - 各チップは `next/link` の `<Link href="/ranking">` にする（`<a href>` として HTML に出す）。ホバーで `hover:border-violet-400`。事務所内チップも同じ `/ranking` へ。ランキングのタブ指定クエリは使わない（未確認のため）。
    - `app/vtuber/[channelId]/page.tsx` では、h1 直下の要約文の下、`DetailView` の上にチップを置く。
      - 既存の `getCachedVTuberRanks()` の結果を使う。**新しいデータ取得や `loadVTubers()` の直接呼び出しは追加しない**（FIX-1 のルール）。
      - `ranks` が `null`（事務所公式チャンネルなど、IDX-4 で順位を出さないページ）のときは、チップ全体を出さない。
      - 同じ順位の数値は要約文と一致させる。
    - サーバーレンダリングの HTML にチップを含める。クライアント fetch やマウント後の描画にはしない。`Date.now()` をプリレンダー中に使わない。
    - 要約文・JSON-LD・`generateMetadata`・「よくある質問」・`loading.tsx`・`DetailView` は変更しない。`/vtuber` 一覧のタブ UI 内の詳細（`VTuberTabs`）には出さない（一覧の HTML を増やさないため）。
    - `any` は使わない。新しいパッケージは追加しない。
    - `FRONTEND_SPEC.md` 5.4 の詳細ページの節に、「要約文の下に順位チップ（全体順位・事務所内順位）を出す。1〜3 位は amber で強調し、`/ranking` へリンクする。事務所公式チャンネルと `個人` の事務所内順位は出さない」旨を追記する。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。ビルドログに `Date.now()` の警告が出ない。
    - `curl -s <URL>/vtuber/UCCzUftO8KOVkV4wQG1vkUvg`（宝鐘マリン）の HTML に `全体` と `位`、事務所内順位のチップ（`ホロライブ内` など）、`href="/ranking"` が含まれる。
    - `curl -s <URL>/vtuber/UCt30jJgChL8qeT9VPadidSw`（しぐれうい・個人）の HTML に全体順位のチップはあるが、事務所内順位のチップは無い。
    - 事務所公式チャンネル（`officeFlg` が true の任意の 1 件）のページにはチップが出ない。
    - チップの順位の数値が、同じページの要約文の順位と一致している。
    - `curl -s <URL>/vtuber/<id> -o d.html && wc -c d.html` が変更前から +1KB 以内。ブラウザのコンソールにハイドレーションの警告が出ない。
    - 375px 幅で、事務所名が長い事務所でもチップが崩れず、ページ全体の横スクロールが出ない。ダークモードで読める。

- [ ] **AI-20261121-13. VTuber 詳細ページに「次の登録者数の節目まであと約N日」の予測カードを出す**
  - **対象ファイル**:
    `lib/milestone.ts`（新規・純粋関数）
    `components/MilestoneForecast.tsx`（新規・Server Component 可。hooks を使わない純粋な表示コンポーネント）
    `app/vtuber/[channelId]/page.tsx`
    `FRONTEND_SPEC.md`（5.4）
  - **背景**: data.vmato.jp は、登録者数の推移を数字で見せるだけで、「あとどれくらいで 100 万人に届くか」までは示さない。Vちゃんねるの詳細ページには `youtubeSubscriberCountTransition`（30 日分）があるのに、グラフと要約文の「増減」でしか使っていない。ファンが最も知りたいのは「推しの次の節目はいつか」である。次の効果が見込める。
    - 「〇〇 100万人 いつ」「〇〇 登録者数 予想」のようなロングテール検索の受け皿になる。
    - ページごとに数値が違う固有の文章になり、IDX 系の「テンプレート文だけで評価が低い」問題の改善にもなる。
    - 節目の突破を共有・再訪したくなる動機になる。
  - **仕様**:
    - `lib/milestone.ts` に純粋関数を追加する。`Date.now()` は使わず、基準日は推移データの最新日付にする（プリレンダー中の不安定な値を避けるため）。
      - `MILESTONES: readonly number[]` = 1万, 2万, 3万, 5万, 10万, 15万, 20万, 30万, 40万, 50万, 60万, 80万, 100万, 150万, 200万, 300万, 500万, 1000万（数値で持つ）。
      - `getNextMilestone(current: number): number | null`: `current` より大きい最小の節目。最大を超えていれば `null`。
      - `estimateMilestone(transition: Record<string, number>, current: number): { milestone: number; remaining: number; dailyGain: number; days: number; eta: { year: number; month: number } ; asOf: { year: number; month: number; day: number } } | null`
        - `transition` のキーは `YYYYMMDD`。有効なキーと数値だけを日付順に並べる。
        - 最古と最新の日付差が 7 日未満、または 2 点未満なら `null`。
        - `dailyGain = (最新値 − 最古値) ÷ 日数差`。0 以下なら `null`。
        - `remaining = milestone − current`、`days = Math.ceil(remaining / dailyGain)`。`days` が 730 を超える場合は `null`。
        - `eta` は最新日付（`asOf`）に `days` 日を足した日の年月（UTC の暦計算でよい。タイムゾーンの影響を受けない書き方にする）。
        - `current` は引数で受け取る（最新値と異なる場合があるため）。
      - 単体テストは既存のテスト方式に合わせる。無ければ一時スクリプト（コミットしない）で次を確認し、結果を PR 本文に貼る: 通常の入力、増加 0（`null`）、減少（`null`）、データ 1 点（`null`）、7 日未満（`null`）、730 日超（`null`）、最大の節目超え（`null`）、月またぎ・年またぎの `eta`。
    - `components/MilestoneForecast.tsx` を作る。
      - Props: `name: string`（表示名。CTR-1 の `displayVtuberName` が実装済みならそれを使い、無ければ `name`）、`current: number`、`transition: Record<string, number>`。
      - `estimateMilestone` の結果が `null` なら何も出さない。
      - 表示は 1 枚の小さなカード（`rounded-xl border border-zinc-200 bg-white p-3`、ダーク: `dark:border-zinc-800 dark:bg-zinc-900`）。
        - 先頭に lucide-react の `Target`（`size={16}`）と見出し `次の節目`（`text-sm font-semibold`）。
        - 本文 1: `登録者数{formatCompact(milestone)}人まで、あと{formatNumber(remaining)}人`（`text-base font-bold tabular-nums`）。
        - 進捗バー: 直前の節目（`MILESTONES` で `current` 以下の最大値。無ければ 0）から次の節目までの達成率を、`h-2 rounded-full bg-zinc-100`（ダーク: `dark:bg-zinc-800`）の中に `bg-violet-500` で表示する。`role="progressbar"`、`aria-valuenow`（%）、`aria-label="次の節目までの進捗"`、幅は `style={{ width: `${pct}%` }}`。
        - 本文 2（`text-xs text-zinc-500`）: `直近{日数差}日の増加ペース（1日あたり約{formatNumber(Math.round(dailyGain))}人）が続くと、{eta.year}年{eta.month}月ごろ（約{days}日後）に届く見込みです。あくまで目安です。`
      - 時刻に依存する表示（「あと N 日で…」の現在時刻との差）は出さない。`days` は推移データの最新日付からの日数であることが分かる文面にする。
      - 見た目は 375px 幅で折り返しても崩れない。ダークモード対応。
    - `app/vtuber/[channelId]/page.tsx` の配置:
      - 要約文（および AI-20261121-09 が実装済みなら順位チップ）の下、`DetailView` の上に `<MilestoneForecast>` を置く。
      - 既存のサーバー取得済みの `VTuberDetail`（登録者数と推移）だけを使う。新しいデータ取得や `loadVTubers()` の直接呼び出しは追加しない（FIX-1 のルール）。
      - 事務所公式チャンネル（`officeFlg === true`）のページには出さない（IDX-4 で順位を出さない方針と同じ）。
      - 「よくある質問」に、推定できるときだけ次の項目を 1 つ追加する（FAQPage の JSON-LD は追加しない）。
        - 質問: `{name}のYouTube登録者数が{milestone}人になるのはいつ？`
        - 回答: `直近{日数差}日の増加ペースが続いた場合、{eta.year}年{eta.month}月ごろの見込みです（目安）。`
      - 要約文・`generateMetadata`・JSON-LD・`loading.tsx`・`DetailView` は変更しない。`/vtuber` 一覧のタブ UI 内の詳細（`VTuberTabs`）には出さない（一覧の HTML を増やさないため）。
    - サーバーレンダリングの HTML にカードを含める。クライアント fetch やマウント後の描画にはしない。
    - `any` は使わない。新しいパッケージは追加しない。
    - `FRONTEND_SPEC.md` 5.4 に次を追記する。
      - 詳細ページに「次の節目」カード（節目の一覧、`dailyGain` の計算、7 日以上の推移が必要、730 日超・増加 0 は出さない、基準日は推移の最新日付で `Date.now()` を使わない）。
      - 事務所公式チャンネルには出さないこと、「よくある質問」に節目の項目を追加すること。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。ビルドログに `Date.now()` の警告が出ない。
    - 登録者が増加中の VTuber の詳細ページ（例: `/vtuber/UCCzUftO8KOVkV4wQG1vkUvg`）の HTML に `次の節目`、`まであと`、`あくまで目安です` が含まれ、`role="progressbar"` の `aria-valuenow` が 0〜100 の数値になっている。
    - 登録者数が横ばい・減少、または推移データが 7 日未満の VTuber のページには、カードも FAQ の節目項目も出ない（空の枠も残らない）。
    - 事務所公式チャンネル（`officeFlg` が true の任意の 1 件）のページにはカードが出ない。
    - 同じページの FAQ の節目の年月が、カードの `eta` と一致している。
    - `curl -s <URL>/vtuber/<id> -o d.html && wc -c d.html` が変更前から +2KB 以内。ブラウザのコンソールにハイドレーションの警告が出ない。
    - 375px 幅・ダークモードで崩れず、ページ全体の横スクロールが出ない。

### P1-VTLIST: VTuber 一覧ページの回遊改善（2026-11-17 追加）

- [x] **VT-GROUP-3. PC の事務所折りたたみを、全事務所表示のときは最初すべて閉じる**
  - **対象ファイル**: `components/VTuberTabs.tsx`
  - **背景**: `/vtuber` を開くと左の一覧でホロライブ（90 人）が開いた状態になり、ほかの 32 事務所が画面外に押し出される。どんな事務所があるかが初見で分からない。
  - **仕様**（`FRONTEND_SPEC.md` 5.4 の VT-GROUP-1 / VT-GROUP-3 の記述どおり）:
    - `openOfficeNames` の初期化（`groupSignature` が変わったときの `useEffect`）で、`channelIds.length === 0` なら空の `Set` にする。選択があるときは従来どおり表示中の事務所だけ開く。
    - 表示中の VTuber（`current`）が属する事務所の見出しは、閉じていても `text-blue-600 dark:text-blue-400` にし、人数の左に `size-1.5 rounded-full bg-blue-600` の丸を出す。
    - 検索結果から別の事務所の人を選んだときは、その事務所を `openOfficeNames` に追加する（ほかは閉じない）。
    - スマホ（`lg` 未満）の 2 段チップは変更しない。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - localStorage が空の状態で PC 幅の `/vtuber` を開くと、左の一覧は事務所見出しだけが並び、ホロライブの見出しが青字＋青い丸になっている。右には従来どおり先頭の VTuber の詳細が出る。
    - フィルターで 2 事務所を選んだ状態では、従来どおり表示中の事務所だけ開いている。
    - 検索で別事務所の人を選ぶと、その事務所が開き、タブが選択状態で見える。

- [x] **VT-NAV-1. VTuber 詳細に「前へ／次へ」ナビを付ける**（VT-GROUP-3 の次に着手）
  - **対象ファイル**: `components/VTuberTabs.tsx`（ナビ部品を同ファイル内に作るか、`components/VTuberStepNav.tsx` を新規作成）
  - **背景**: 1 人見終わったら、左（スマホは上）のタブ列に戻って次の人を探す必要がある。特にスマホは最新動画 30 件の下まで読んだ後、タブ列が遠い。スワイプは誤操作・発見しにくさ・横スクロール要素との競合があるため採用せず、明示的なボタンにする。
  - **仕様**（`FRONTEND_SPEC.md` 5.4 VT-NAV-1 の記述どおり）:
    - 順番は `listItems` の並び。`current` の位置から前後を求める。端ではその側のボタンを出さない。
    - 詳細の上に前後ナビの 1 行、詳細の下に `次のVTuber` カード型ボタンを置く。どちらも `Detail` の外（`VTuberTabs` 側）に描画し、`DetailView` は変更しない。
    - 移動は `handleTabSelect(channelId)` を通す。移動先が別の事務所なら、PC は `openOfficeNames` にその事務所を追加、スマホは `setMobileOfficeFilter(その事務所)` にする。
    - 下のボタンで移動したときは、上のナビ行へ `scrollIntoView({ block: "start" })` する（固定ヘッダーに隠れないよう `scroll-mt-20`）。
    - PC は `←` / `→` キーで移動する（`window` の `keydown`。`input` / `textarea` / `contenteditable` にフォーカスがあるとき、修飾キー付きのときは無視）。
    - 先読みを「次の 1 人」から「前後 1 人ずつ」に広げる。
    - 検索から表示中（`searchPinned`）の人の前後も `listItems` の並びに従う。
    - `any` は使わない。新しいパッケージは追加しない。アイコンは lucide-react の `ChevronLeft` / `ChevronRight`。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/vtuber` で `次` を押すと次の人の詳細に切り替わり、タブ列の選択も移る。ホロライブ最後の人で `次` を押すと次の事務所の先頭の人になり、PC はその事務所が開き、スマホは事務所チップが切り替わる。
    - 先頭の人では `前` が、最後の人では `次` が出ない。
    - 下の `次のVTuber` を押すと、次の人の詳細の先頭までスクロールする。
    - PC で `→` キーでも移動し、検索欄に入力中は移動しない。
    - 375px 幅でナビ行が 1 行に収まり、ページ全体の横スクロールが出ない。ダークモードで読める。
    - `/vtuber/[channelId]` にはナビが出ない。

- [x] **VDIR-2. 「事務所から探す」を 1 枚のパネルにして、ページに馴染ませる**（VDIR-1 の HTML サイズ対応と同じ PR で行ってよい。VT-NAV-1 の次に着手）
  - **対象ファイル**: `components/VTuberDirectory.tsx`、`app/vtuber/page.tsx`
  - **背景**: 現在は影付きの箱が 33 個縦に並び、上のタブ UI や左の事務所一覧とトーンが合わず、「SEO 用に後付けした一覧」に見える。閉じた状態では中に誰がいるか分からず、開く動機も弱い。
  - **仕様**（`FRONTEND_SPEC.md` 5.4 VDIR-2 の記述どおり）:
    - セクションに `id="offices"`、見出しの下に事務所数・人数の 1 行説明を付ける。
    - 全事務所を 1 枚のパネル（`rounded-xl border ... divide-y`）に入れ、各 `<details>` は区切り線の行にする。行ごとの枠線・影・`space-y-2` はやめる。
    - `<summary>`: 事務所アイコン（`getCachedVTuberPageData()` の `officeGroups[].thumbnail` を `ytThumbUrl(..., 48)`、`loading="lazy"`、無ければ頭文字の丸）＋ `<h2>` 事務所名＋人数＋ `ChevronDown`。名前の下に登録者数上位 3 人の名前と `ほかN人`。
    - 中身: メンバーチップ（violet 系ホバー）。60 人を超える事務所は `max-h-72 overflow-y-auto`。
    - メンバー一覧は VDIR-1 の追記どおり、`escapeHtml` した HTML 文字列を `dangerouslySetInnerHTML` で出す（`<Link>` は使わない）。リンクを CSS で隠さない。
    - `app/vtuber/page.tsx` の要約文の後に `<a href="#offices">事務所から探す ↓</a>`（`text-sm text-blue-600`）を置く。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。`npm run build` が成功する。
    - `/vtuber` の初期 HTML に全メンバーの `<a href="/vtuber/...">` と事務所ごとの `<h2>` が含まれる（閉じた `<details>` の中身として）。
    - `.next/server/app/vtuber.html` が 830KB 以下（VDIR-1 の目安）。
    - 閉じた状態で各行に事務所アイコン・名前・人数・上位 3 人の名前が見える。`個人` を開いても中身がスクロール領域に収まる。
    - `事務所から探す ↓` を押すとセクションへ移動する。375px 幅・ダークモードで崩れない。
