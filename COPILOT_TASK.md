# COPILOT_TASK: ランキングへの「登録者 急上昇」タブ追加および UI 改善バックログ

> 最終更新: 2026-11-13 / 担当: プロダクトデザイナー → 実装: GitHub Copilot

---

## 完了したタスク (Done)

- [x] **ランキングに「登録者 急上昇（増加数）」タブを追加する** (2026-11-03 完了)
  - 期間切替（週間/月間）、増加数・増加率・ミニ推移グラフ、GCSからのデータ取得・集計ロジックの実装。

---

## ⏳ 未完了タスク (To Do) - UI改善バックログ（data.vmato.jp 比較）

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

- [ ] **S404-2. `/events` に今日のイベントをサーバーレンダリングする**
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

### P0-AFF: もしもアフィリエイト組み込み（最優先・他タスクより先に着手）

> **前提（人手作業・Copilot は実施不要）**:
> 1. もしもアフィリエイト管理画面で **Amazon** と **楽天市場** のプロモーションに提携申請し、承認を得る（サイト審査とは別に必要）。
> 2. 各プロモーションの「リンク作成」で任意の商品リンクを1本ずつ生成し、`a_id` / `p_id` / `pc_id` / `pl_id` の値を控える（**`a_id` は Amazon と楽天で異なる**）。
> 3. Vercel の Environment Variables（Production / Preview）に以下を登録する。
>    - `NEXT_PUBLIC_MOSHIMO_AMAZON_AID` / `NEXT_PUBLIC_MOSHIMO_RAKUTEN_AID`
> - 環境変数が未設定の環境（ローカル等）では、アフィリエイト枠を**一切表示しない**こと（素のリンクにもフォールバックしない）。

- [ ] **AFF-1. もしもリンク生成ユーティリティ＋商品導線コンポーネント＋VTuber詳細ページへの設置**
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

- [ ] **AFF-2. 広告掲載に関する表記・プライバシーポリシーページ**
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

- [ ] **AFF-3. イベントカレンダー（誕生日・周年）への商品導線**
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

- [ ] **SEO-1. VTuber 詳細ページのサーバーレンダリング化＋個別メタデータ＋構造化データ**
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
    - JSON-LD（`<script type="application/ld+json">`、`<` は `<` にエスケープ）を出す。
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

- [ ] **SEO-2. sitemap に全 VTuber 詳細ページを追加**
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

- [ ] **SEO-4. 日付別「誕生日・周年のVTuber」ページ（366 ページ）**
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

- [ ] **SEO-5. AI 検索向け `llms.txt` とランキングの構造化データ**
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

- [ ] **SEO-6. VTuber 詳細ページの動的 OGP 画像（X での共有 CTR 向上）**
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
- [x] **P0-7. `/vtuber` の初期表示を速くする（スケルトン表示＋API の CDN キャッシュ）**
  - **対象ファイル**:
    `components/VTuberTabs.tsx`
    `app/api/vtuber/route.ts`
    `app/api/vtuber/[channelId]/route.ts`
    `app/vtuber/loading.tsx`（新規）
    `FRONTEND_SPEC.md`
  - **背景（2026-11-08 計測）**:
    - `/vtuber` はページ自体は静的で、データは hydration 後にクライアントから `GET /api/vtuber`（約 377KB / gzip 約 136KB）→ 完了後に `GET /api/vtuber/{先頭のchannelId}`（約 20KB）を**直列に**取得している。ウォームなインスタンスでも 2 本で合計 約 1.5 秒、その間は「Vtuberリストを読み込み中…」の文字だけが表示される。
    - 両 API は `cache-control: public, max-age=0, must-revalidate` / `x-vercel-cache: MISS` で CDN に一切キャッシュされず、毎回 iad1 の関数が実行される。コールドスタート時は `loadVTubers()` が GCS から `officedataList.json`（約 19MB）を取得・パースするため、数秒以上かかる。
    - P0-4 で `VTuberTabsSkeleton` / `VTuberDetailSkeleton` は `components/Skeleton.tsx` に作成済みだが、`VTuberTabs.tsx` では使われておらず、テキスト表示のまま。
  - **仕様**:
    - **スケルトン表示**（`components/VTuberTabs.tsx`）:
      - `index.status === "loading"` のとき、テキストの代わりに既存の `VTuberTabsSkeleton` を返す。
      - `Detail` の読み込み中（`!result || result.id !== channelId`）は、テキストの代わりに既存の `VTuberDetailSkeleton` を返す。タブ列はそのまま表示し続け、タブ切り替え時に詳細部分だけがスケルトンになること（タブ列ごと消えて画面がガタつかないこと）。
      - エラー／0 件時の文言（`Vtuberリストの取得に失敗しました` / `Vtuberリストがありません（フィルターで事務所を選択してください）`）は変えない。ただし `Detail` の取得失敗文言は現状 `Vtuberリストの取得に失敗しました` になっているので、`VTuberの詳細を取得できませんでした` に直す。
      - `app/vtuber/loading.tsx` を新規作成し、見出し `VTuber`（`app/vtuber/page.tsx` と同じ `main` / `h1` の構成）＋ `VTuberTabsSkeleton` を表示する。他ページからのクライアント遷移時に空白が出ないようにするため。
    - **API の CDN キャッシュ**（`app/api/vtuber/route.ts`, `app/api/vtuber/[channelId]/route.ts`）:
      - 成功レスポンス（200）に `Cache-Control: public, s-maxage=600, stale-while-revalidate=3600` を付ける（`Response.json(body, { headers })`）。データの更新は定期バッチで、鮮度は 1 時間程度で十分（`FRONTEND_SPEC.md` 6 章）。2 回目以降のアクセスは Vercel CDN から返り、コールドスタート（19MB の読み込み）を利用者が待たなくて済むようにする。
      - 404 / 502 には付けない（`Cache-Control: no-store` を明示する）。失敗結果を CDN に残さないため。
      - ブラウザ側のキャッシュ（`max-age`）は付けない。CDN でのみキャッシュする。
    - **詳細のクライアント側キャッシュとプリフェッチ**（`components/VTuberTabs.tsx`）:
      - 取得済みの `VTuberDetail` をモジュールスコープの `Map<string, VTuberDetail>` に保持し、一度開いたタブに戻ったときは即時に表示する（スケルトンを出さない）。失敗結果は保持しない。
      - タブボタンの `onPointerEnter` / `onFocus` で、その VTuber の詳細を先読みする（キャッシュ済み・取得中なら何もしない。同じ ID の二重リクエストを出さないよう、取得中の Promise も `Map` で共有する）。
      - 一覧取得の完了後、表示中の詳細に加えて、次のタブ 1 件分を先読みしておく。
  - **範囲外**: `/api/vtuber` のレスポンス縮小（選択事務所での絞り込みや項目削減）、Server Component 化によるサーバー側での事前描画、関数リージョンの変更（GCS バケットの所在地を確認してから別タスクで検討）、バックエンド（`backend-repo/functions/`）の変更。
  - **完了条件**:
    - `npx tsc --noEmit` がエラーなし。
    - `npm run build` が成功する。
    - `/vtuber` を開くと、データ取得中は文字ではなくタブ列＋詳細のスケルトンが表示され、取得後に実データに置き換わる。スケルトンと実データでレイアウトが大きくずれない（375px / 1280px、ダークモードの両方で確認）。
    - タブ切り替え時はタブ列が残ったまま詳細部分だけスケルトンになり、一度開いたタブに戻ると即時に表示される。
    - デプロイ後、`curl -sI https://vchannel-web-a4rd.vercel.app/api/vtuber` を 2 回実行し、2 回目のレスポンスヘッダーに `x-vercel-cache: HIT`（または `STALE`）が出る。`/api/vtuber/{channelId}` も同様。存在しない ID の 404 は `HIT` にならない。
    - `FRONTEND_SPEC.md` の 5.4 節と 6 章が更新されている。

### P1: 競合と同等の機能を揃える
- [x] **P1-1. トップページにヒーロー＋「いま注目のVTuber」カード**
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
    - 追加パッケージは不要。`FRONTEND_SPEC.md` の「ニュース」節（5.3）に、`lib/newsFil