# COPILOT_TASK: ランキングへの「登録者 急上昇」タブ追加および UI 改善バックログ

> 最終更新: 2026-11-14 / 担当: プロダクトデザイナー → 実装: GitHub Copilot

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

- [ ] **DOMAIN-1. `SITE_URL` の本番フォールバックを `https://www.vchannel.net` にする**
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

- [ ] **DOMAIN-2. canonical が無い公開ページに canonical を追加する**
  - **対象ファイル**: `app/page.tsx`、`app/vtuber/page.tsx`、`app/events/page.tsx`、`app/news/page.tsx`、`app/chat/page.tsx`、`app/privacy/page.tsx`
  - **仕様**:
    - 各ページの `metadata` / `generateMetadata` に `alternates: { canonical: "<パス>" }` を追加する（`/`、`/vtuber`、`/events`、`/news`、`/chat`、`/privacy`）。`metadataBase` が `SITE_URL` なので、相対パスで書けば絶対 URL になる。
    - 既存の title / description は変えない。`generateMetadata` の `catch` 側（フォールバック）にも canonical を入れる。
    - `/favorites` と `/settings` は robots で disallow 済みのため対象外。
  - **完了条件**:
    - `npx tsc --noEmit` / `npm run build` がエラーなし。
    - 上記 6 ページの HTML に `<link rel="canonical" href="https://www.vchannel.net/...">` が 1 つだけ出る（本番）。
    - `FRONTEND_SPEC.md` 6.1（PM 更新済み）の記述と実装が一致している。

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

- [ ] **FILTER-1. 掲示板はフィルターに関係なく全スレッドを表示する**
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

- [ ] **FILTER-9. 旧 UI の「全選択」で全 ID が保存されたままの人を「すべて表示」に戻す**（FILTER-8 の次に着手）
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

- [ ] **VDIR-1. 「事務所別VTuber一覧」を事務所ごとの折りたたみに変える（見た目の改善・SEO は維持）**
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

- [ ] **VT-ICON-1. VTuber タブの名前・事務所名の横にアイコンを出す（フィルターとそろえる）**（2026-11-14 追加・VT-PROFILE-1 の次に着手。FILTER-2 が終わっていること）
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

### P0-CHATUX: 掲示板の見た目の整理と「書き込むきっかけ」づくり（2026-11-14 追加・P0-VTFIND の次に着手。FILTER-1 が終わっていること）

> **背景（2026-11-14 本番データ）**: スレッド 29 本のうち、投稿がいちばん多いのは「個人」の 28 件。ほとんどは 0〜4 件。直近の投稿は 11/3、その前は 5/31・2/26 で、数か月に 1 件しか書き込まれていない。Bot 投稿は 0 件。
> 一方で UI は「古い順に並ぶので開くと 2025 年の投稿が先頭に出る」「0 件のスレッドカードが横に並ぶ」「注意事項パネルが最初から開いている」「押してもどこにも保存されないリアクション」があり、人がいないことが目立っている。
>
> **方針**: (1) 投稿が少なくても止まって見えない見た目にする。(2) 掲示板の外（VTuber 詳細・配信中カード）と中（お題）に、書き込むきっかけを置く。仕様の正は `FRONTEND_SPEC.md` 5.6（PM 更新済み）。
>
> ⚠ スレッドの `postCount` は実際のレス数より小さい（2.2 参照）。0 件に見えても投稿がある場合があるため、**`postCount` を根拠にスレッドを非表示にしない**こと。

- [ ] **CHAT-4. 掲示板の見た目を整理する（新しい順・注意事項は閉じる・見かけだけのリアクションを外す）**
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

- [ ] **CHAT-5. 掲示板に「お題」チップを出して、ワンタップで書き始められるようにする**（CHAT-4 の次に着手）
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
