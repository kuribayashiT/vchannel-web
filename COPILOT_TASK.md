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

### P0-AFF: もしもアフィリエイト組み込み — ⛔ **保留（着手禁止）**

> **⛔ 2026-11-11: もしもアフィリエイトの会員登録審査が否認された。** 下記 AFF-1 / AFF-3 / AFF-4 は**実装しないこと**（もしもの `a_id` は無効のため、リンクを入れても成果にならない）。
> - 未完了の AFF タスクは飛ばし、次の未完了タスク（AFF-5 → P0-SEO の SEO-1）に進むこと。
> - 代替 ASP（楽天アフィリエイト直接など）が決まり次第、AFF-1 / AFF-3 / AFF-4 を書き換えて保留を解除する。それまでは `[ ]` のまま残す。

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

- [ ] **AFF-4. 楽天ウィジェット（もしも版・新 JS）をトップとランキングに設置**
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
- [x] **P0-3.