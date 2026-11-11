# Vちゃんねる フロントエンド仕様書（Next.js 移行・AI駆動開発用）

Flutter アプリ（`lib/`, v2.22.2）の現行実装を元にまとめた仕様。Next.js 版の要件定義と、Claude Code / GitHub Copilot へのコンテキスト共有を目的とする。
既存の [SPEC.md](../SPEC.md) は概要版で、コードと差異がある（末尾「SPEC.md との差異」参照）。**本書はコードを正とする。**

---

## 1. 概要

| 項目 | 内容 |
|---|---|
| サービス | VTuber ファン向け：配信スケジュール／ニュース／VTuber 情報／ランキング／掲示板 |
| 現行 | Flutter（iOS / Android / Web）。Web は `build/web` を Firebase Hosting で配信 |
| バックエンド | Firebase プロジェクト `vtuber-335811`（Cloud Functions 1st Gen / GCS / Firestore / RTDB / Remote Config / FCM） |
| 言語・TZ | 日本語のみ。日付判定は端末ローカル時刻（実質 JST） |

### サイトアイコン
- ブラウザのタブと iPhone のホーム画面アイコンには `public/logo.png` を使用する。

### Search Console 確認タグ
- Google Search Console の URL プレフィックス プロパティ `https://vchannel-web.vercel.app` の所有権確認に、`app/layout.tsx` の `metadata.verification.google` を使用する。

### 移行方針（推奨）
- 読み取りデータは **公開 JSON（GCS）を fetch するだけ**。サーバー実装不要。Next.js では ISR/`revalidate`（60〜300 秒）または SWR で取得する。
- 認証なし。ユーザー状態（お気に入り・選択事務所）は **localStorage**。
- Web ではネイティブ専用機能（Push通知・AdMob・共有ネイティブ）は省く。

---

## 2. データソース（バックエンド契約）

### 2.1 GCS 公開 JSON（主要データ。GET のみ、認証なし）

ベース: `https://storage.googleapis.com/vtuber-335811.appspot.com/<file>`
Cloud Functions が定期更新する。アプリは 1 時間 TTL でキャッシュ。

| ファイル | 内容 | 使用画面 |
|---|---|---|
| `officedataList.json` | `{ "<事務所名>": [VTuber, ...] }` | VTuber / 絞り込み |
| `livevideoList.json` | `[Video, ...]`（配信中の動画） | 配信タブ全般 |
| `allvideos.json` | `[Video, ...]` | お気に入り、VTuber 詳細の動画一覧 |
| `news.json` | `[News, ...]` | ニュース |
| `eventList.json` | `[ { "<M/D>": [Event, ...] }, ... ]` | イベントカレンダー |
| `rankingYoutubeRegiData.json` | 登録者数ランキング元データ（`youtubeSubscriberCount`）。旧形式 `{jsonData: ...}` 両対応 | ランキング |
| `rankingTwitterData.json` | `twitterFollowerCount`。同上 | ランキング（現状 UI 未使用の可能性。要確認） |
| `weeklyLiveViewRanking.json` | `[ {..., concurrent_viewers} ]` | ランキング |
| `rankingVideoCountData.json` | `[ {..., videoCount} ]` | ランキング |

> 旧 Cloud Functions（`getOfficeListData` など `https://us-central1-vtuber-335811.cloudfunctions.net/<name>`）は現行アプリでは未使用。新規実装では使わない。

### 2.2 Firestore（掲示板のみ）
- `threads` コレクション：`office`（事務所名。RTDB `officeMapping` で表示名に変換）, `lastUpdated`, `postCount`
- `posts` コレクション：`threadId`, `content`, `author`, `postNo`, `parentNo`, `createdAt`（serverTimestamp）, （Bot 投稿の判別フィールドあり）
- クエリ: `posts where threadId == X order by createdAt asc`（realtime snapshots）
- 書き込み: `posts` に追加し、`threads/{id}` の `lastUpdated` / `postCount(+1)` を更新。`postNo` は既存件数+1、`>>N` アンカーの最小値を `parentNo` に格納。
- **本番ルール（2026-11-08 Console で確認）**: `threads` / `posts` は read 公開。
  - `threads`: update は `lastUpdated == request.time` かつ `postCount` +1 のみ許可。create / delete は不可。
  - `posts`: create のみ許可。主な条件は以下のとおり。update / delete は不可。
    - フィールドは `threadId`, `content`, `author`, `postNo`, `parentNo`, `createdAt`, `isBot` に限定する。
    - `content` は 1〜500 字、`author` は 20 字以内。
    - `createdAt == request.time`。
    - `isBot` は false または省略。
  - その他のコレクションは全拒否。
- ⚠ リポジトリ内 `backend-repo/firestore.rules` は 2022 年の期限切れルールのままで、本番と一致していない。**`firebase deploy --only firestore` を実行すると本番ルールが上書きされるため禁止**。本番ルールは Console 側が正。
- ⚠ 既知の不整合: Flutter アプリは投稿後に thread の `lastUpdated` だけを更新しようとし、ルールで拒否されている（エラーは握りつぶし）。このため Flutter からの投稿分は `postCount` と `lastUpdated` に反映されず、**`postCount` は実際のレス数より小さい**。採番には `postCount` を使わないこと。
- `postNo` はルール上 `>= 1` のみの検証で、一意性は保証されない（COPILOT_TASK CHAT-2 で Web 側を改善予定）。

### 2.3 Realtime Database
- 読み取りは `officeMapping` のみ（Firestore の事務所名 → 表示名の変換表、約 600B）。`office` ノードは管理画面が REST で読む。
- **RTDB ルールは `.read:false` を既定とし `officeMapping` / `office` のみ公開**（2026-11 に料金急増対策で変更済み）。Web から `/` などを読まないこと。

### 2.3.1 VTuber 自動発見・自動登録（バックエンド、2026-11-11 追加）
- 実装: `backend-repo/functions/vtuberDiscovery.js`。`index.js` の `scheduledVtuberDiscovery`（毎日 0:30 JST）が実行し、`previewVtuberDiscovery`（HTTP GET）は書き込みなしの試走結果を返す。
- 流れ: Holodex（`type=vtuber`、登録者数の多い順）→ 未登録チャンネルを YouTube API で再確認 → Wikidata で照合 → 判定 → RTDB `vtuber` / `officeMapping` / `office` に 1 回のマルチパス更新で書き込む。登録後の登録者数・ランキング・`officedataList.json` は既存の 24 時間／30 分ジョブがそのまま拾う。
- 登録条件: 登録者数 5 万人以上（YouTube API の値）、Holodex で `inactive` でない、チャンネル ID・Twitter ID が既存と重複しない、本人確認シグナル（Wikidata の P2397 一致／既知の事務所所属／チャンネル名・概要・キーワードに VTuber 関連語）が 1 つ以上。個人勢と新規事務所は日本語圏のみ（名前にかな・カナ、または概要にかな・カナ 30 字以上）。
- 事務所チャンネル: 事務所に所属していて、名前に「公式」「official」がある、または名前がほぼ事務所名だけ（例: `hololive ホロライブ - VTuber Group`、`KAMITSUBAKI STUDIO`）のチャンネルは `officeFlg: true` で登録する（一覧で先頭に出る）。新規事務所を作る際の人数には数えない。
- 所属の判定: Holodex の org と `group`（例: hololive の `English -Promise-`）を、登録済み VTuber の実際の `office` と照らして学習した対応を優先する（`group` 単位 → 地域 EN/ID/KR → 自動作成時の学習 → org 全体 → 静的マップ）。個人勢（Independents / Twitch Independents）は常に `personal`。実在の事務所を `personal` として学習しない。
- 保留（`vtuberDiscovery/pending`、登録しない）: 本人確認シグナルなし／Twitter 重複・Holodex `extra_ids` が登録済み（サブチャンネル）／名前に「切り抜き」「まとめ」「翻訳」／個人勢なのに「公式」を名乗る／メンバー 1 人だけの未知の事務所。
- 事務所の自動追加: 未知の Holodex org は、条件を満たすメンバーが 2 人以上いれば `officeMapping` と `office` に追加する（表示名は Holodex の英語名。`vtuberDiscovery/offices/{key}.needsNameReview` が true のものは日本語名に手で直す）。30 分ジョブにより、新しい事務所の掲示板スレッドが自動で作られる点に注意。
- 上限: 1 回あたり登録 30 人・新規事務所 3 件。超過分は翌日以降に繰り越す。
- 自動登録された VTuber の行には `registeredBy: "auto-discovery"` と `discovery`（Holodex org、登録時の登録者数、Wikidata ID、判定シグナル）が付く。`debut` / `birthday` は空で登録し、下記 2.3.2 の補完ジョブが埋める（チャンネル開設日はデビュー日と一致しないため使わない）。
- 設定・停止（2.3.1）: `vtuberDiscovery/config`（`enabled` / `minSubscribers` / `maxRegisterPerRun` / `maxNewOfficesPerRun` / `minMembersForNewOffice`）で上書きできる。`enabled: false` で停止する。実行記録は `vtuberDiscovery/runs`（直近 30 件）に残る。`vtuberDiscovery/*` は公開読み取り不可。

### 2.3.2 誕生日・デビュー日（周年）の自動補完（バックエンド、2026-11-11 追加）
- 実装: `backend-repo/functions/vtuberProfiles.js`。`scheduledFillVtuberProfiles`（0:45 / 6:45 / 12:45 / 18:45 JST、1 回約 7 分）が実行し、`previewVtuberProfiles?limit=20`（HTTP GET）は書き込みなしの試走結果を返す。
- 対象: 事務所チャンネル以外で `birthday` か `debut` が空のもの（新しく登録された順）。**既存の値は上書きしない**。調べたものは `vtuberProfiles/checked/{channelId}` に記録し、30 日間は再検索しない。
- 取得元: 誕生日は Wikidata（チャンネル ID 一致・P569 の日単位の値）→ Virtual YouTuber Wiki。デビュー日は Virtual YouTuber Wiki の `debut_date` の最初の日付のみ（Wikidata の P2031 は告知日などが入りずれるため使わない）。Wiki の記事は、channel 欄の `@handle` / チャンネル ID が YouTube と一致した場合だけ採用する。
- 形式: `birthday` は `MM-DD`、`debut` は `YYYY/MM/DD`（既存データの多数派・`eventList` の周年計算と同じ）。出典を `profileSource.birthday` / `profileSource.debut`（`wikidata:Q…` / `fandom:記事名`）に残す。
- 誕生日は `birthdayJobs.js`（2026-11-04 導入）の `scheduledFillVtuberBirthdays`（1:00 JST、Wikipedia/Wikidata 照合・信頼度 high/medium のみ反映、照合結果は `birthdayLookup/{key}`）も補完する。GPT による補完は「記入例の 06-21 をそのまま返す」不具合があったため廃止済み（375 件を `birthdayBackup/` に退避してクリア）。
- `vtuber/{key}` への書き込みは `onVtuberWriteForEventList` が誕生日を `MM-DD` に正規化して `meta/eventListDirty` を立て、`scheduledRebuildEventList`（10 分ごと）が `eventList.json` を作り直す。両関数・`rebuildEventList` は削除しないこと。
- 検証（2026-11-11、既存値ありの 40 人で値を消して再取得）: 誕生日 39/39 一致、デビュー日 27/39 完全一致・3/39 は 3 日以内。未入力 40 人では 24 人が埋まった。

### 2.4 Remote Config
| キー | 用途 |
|---|---|
| `noticeJson` | お知らせ（タイトル/本文のリスト）。前回値と比較して "New" バッジ |
| `YoutubeNativeADInterval` | ネイティブ広告の挿入間隔（件数） |
| `InterstitialADInterval`（`IntersticialADInterval` も読む） | インタースティシャル広告の間隔 |

fetch timeout 1 分 / 最小 fetch 間隔 5 分。Next.js では `noticeJson` のみ必要（広告は Web 未使用）。

---

## 3. データモデル

### VTuber（`officedataList.json` の要素）
`channeID`（※綴りは原文のまま。YouTube チャンネル ID）, `name`, `office`, `officeKey`, `officeFlg`（true=事務所公式アカウント。一覧で先頭に表示）, `officeName`, `channelThumbnail`, `title`, `subscriberCount`/`youtubeSubscriberCount`, `viewCount`, `videoCount`, `youtubeSubscriberCountTransition`（`{ "YYYYMMDD": 登録者数 }`、折れ線グラフ用）, `twitterName`/`twitterID`, `twitterFollowerCount`, `twitterSubscriberCountTransition`, `birthday`, `debut`, `createdAt`, `updateTime`, `order`
※ 数値が文字列で入る場合がある（例 `"videoCount":"2135"`）。必ず `Number()` で変換。

### Video（`livevideoList.json` / `allvideos.json`）
`videoID`（旧表記 `videoId` が混在）, `title`, `channelId`, `channelTitle`, `channelThumbnail`, `thumbnail`, `office`, `officeKey`, `concurrent_viewers`（文字列）, `scheduledStartTime`, `actualStartTime`, `actualEndTime`（未終了は `""`）, `comparisonDay`（ISO8601 UTC。**画面の日付振り分けに使う基準時刻**）, `publishedAt`

### News
`channel`（媒体名。空/`YouTube` など。未設定時は「ブログ記事」表示）, `title`, `publishedAt`（`YYYY-MM-DD HH:mm:ss`）, `description`, `url`, `urlToImage`, `sourceName`, `sourceUrl`, `creator`, `videoUrl`（任意。解説動画の YouTube URL）

### Event
`eventType`（`createAt` = 周年 / `birthday` = 誕生日）, `channelId`, `channelThumbnail`, `name`, `office`, `createdAt`（`YYYY/MM/DD`。周年計算に使用）

### Push ペイロード（FCM、ネイティブのみ）
`notificationId`, `videoID`, `title`, `thumbnail`, `comparisonDay`, `channelTitle`

---

## 4. ローカル状態（Web は localStorage で再現）

| キー（Flutter の SharedPreferences） | 型 | 意味 |
|---|---|---|
| `favoriteOffices` | string[] | 選択中の事務所（絞り込み対象） |
| `selectedChannelIds` | string[] | Web の絞り込み対象チャンネル。**空の場合は絞り込みなし（すべて表示）**。全チャンネルを選んだ状態は空に正規化して保存し、全 ID は保存しない（自動登録で増えた VTuber が漏れないようにするため） |
| `favorites` | string[] | お気に入り動画の videoID |
| `cached*` / `lastUpdate_*` | JSON 文字列 / ISO 日時 | データキャッシュ（TTL 1 時間）。Next.js では不要（fetch キャッシュに任せる） |
| `interAdCount` | int | 広告カウンタ（Web 不要） |

グローバル状態（Provider）：`SelectedCategorie`（選択事務所・VTuber/チャンネル ID、事務所順）, `FavoriteVideoData`, `YoutubePlayerState`（再生中動画 ID）, `PushRegisterState`, `ChangeTopTitle`。

---

## 5. 画面仕様

### 5.0 アプリシェル
- 下部ナビ（現行 4 項目）：**配信 / ニュース / VTuber / チャット**。ランキングはシェル下部に無く、ランキング画面内に独自のタブバーがある（現行のねじれ。Next.js 版は 5 タブにそろえてよい）。
- 右上メニューから **フィルター（サイドメニュー）** を開く。ヘッダーに「設定（Option）」「お気に入り」「イベントカレンダー」への導線。
- 初回アクセス時は事務所選択を表示せず、絞り込みなしで表示する。
- 絞り込み中（選択が空でない）はヘッダーのフィルターボタンの左に `絞り込み中 N人` チップ（N = 選択チャンネル数）を出す。チップのタップでフィルターを開き、`X` で `resetSelection()` して全件表示に戻す。選択が空なら出さない。
- 共通フッター（指標の説明・注意書き・フッターリンク）は表示しない。
- 動画をタップすると画面下部の **YouTube プレーヤー** が出る（グローバル状態で動画 ID 管理）。YouTube 埋め込み不可時は WebView（Web では新規タブ）に遷移。
- 通知タップ/受信で動画ダイアログ（ネイティブのみ）。

### 5.1 サイドメニュー「フィルター」
- 検索: `VTuber名で検索...`（名前の部分一致、結果なし: `該当するVTuberが見つかりません`）。
- 事務所リストの先頭に `すべて表示` 行を置く（検索中は出さない）。選択が空のときは `すべて表示`・全事務所の丸・全 VTuber チップをチェック済みの見た目にし、補足 `事務所やVTuberをタップすると、そこだけに絞り込みます` を出す。選択があるときに `すべて表示` をタップすると選択を空に戻す。
- 「すべて表示」の状態で事務所の丸をタップすると、その事務所のメンバーだけの選択になる。VTuber チップをタップすると、その 1 人だけの選択になる。選択があるときは従来どおりトグルし、最後の 1 人を外すと「すべて表示」に戻る。
- 事務所リスト：行タップで展開/折りたたみ、左の丸で事務所内全員をトグル。状態は 全選択=青塗り＋チェック / 一部=薄い青 / なし=グレー。
- VTuber個別の選択 UI は丸みの強いチップ（イニシャル＋チェック）で表示し、選択時はグラデーション背景で強調する。
- 事務所・チャンネルはサイドメニュー内で直接選択し、設定から絞り込みを解除できる。
- **選択中チャンネル ID が 配信・VTuber・ランキングの全データを絞り込む。** 掲示板は絞り込まない（5.6）。

### 5.2 配信タブ（5 サブタブ）
横スクロールタブ。**初期表示は「配信中」**（index 1）。Web ではスワイプ無効（タップのみ）。

| タブ | 抽出条件（`comparisonDay` をローカル時刻に変換） | 表示 | 空表示 |
|---|---|---|---|
| 過去アーカイブ | `allvideos.json` の `comparisonDay` が今日より前 | 新しい順の一覧（30 日制限はコード上なし） | `配信済みの動画はありません` |
| 配信中 | `livevideoList.json` の全動画（選択チャンネルで絞り込み、開始・終了時刻では絞り込まない） | JSON の順序で一覧表示、同時視聴者数 `concurrent_viewers` 付き | `配信中の動画はありません` |
| 今日の配信 | `allvideos.json` の `comparisonDay` が今日 | **0〜23 時の時間帯別グルーピング** | `配信予定の動画はありません` |
| 明日の配信 | `allvideos.json` の `comparisonDay` が明日 | 同上（時間帯別） | 同上 |
| 明日以降の配信 | `allvideos.json` の `comparisonDay` が 2 日後以降 | 日付順 | 同上／エラー `動画の読み込みに失敗しました。` |

- ローディング: `配信予定を読み込み中…`
- 共通：選択チャンネルで絞り込み。カード＝サムネイル・タイトル・チャンネル名・日時。タップで再生。お気に入りボタン。
- トップページではサーバー側で `allvideos.json` を当日〜7日後と過去60件に絞り、カード表示に必要な項目だけをクライアントへ渡す。
- 予定動画（今日以降）には **通知スイッチ**（ネイティブのみ。Web では非表示でよい）。
- グリッド：幅 >1000px で 3 列、>600px で 2 列、それ以下 1 列。
- ネイティブ広告をリスト内に挿入（Web は AdSense 等で別途検討）。

### 5.3 ニュース
- 縦スクロールのカード一覧＋プルリフレッシュ。ローディング `ニュースを読み込み中…`、失敗 `ニュースデータの取得に失敗しました（空データ）` ＋ `再読み込み`。
- カード：媒体名（無ければ `ブログ記事`）、タイトル、公開日、サムネ（`urlToImage`）、`videoUrl` があれば動画サムネ/再生導線。
- タップ → 記事 URL を WebView（Web は外部リンク/別タブ。`news.json` の `url` は外部サイト）。
- 5 件ごとにネイティブ広告。検索・カテゴリ絞り込みなし。並び順は `news.json` の順（フロントで再ソートしていない）。

### 5.4 VTuber
- `/vtuber` は Server Component で `loadVTubers()` の index を取得し、`getCachedVTuberPageData()`（`"use cache"` + `cacheLife("hours")`）で 1 時間キャッシュする。取得できた index（軽量版）を `VTuberTabs` の `initialIndex` として渡し、初期 HTML に一覧を含める。
- `VTuberTabs` は `initialIndex` がある場合に `/api/vtuber` を再 fetch しない。`/api/vtuber/[channelId]` の詳細取得は従来どおりクライアントで行う。
- h1 直下に要約文を表示し、`generateMetadata` で title を `VTuber一覧（事務所別）`、description に事務所数・人数を含める。
- 選択が空のときはタブを出さず、案内カード（`SlidersHorizontal` アイコン、`気になる事務所やVTuberをフィルターで選ぶと、ここにタブで並びます。下の「事務所から探す」からも見られます。`、`フィルターを開く` ボタン）を表示する。選択があるのに該当 0 人なら `Vtuberリストがありません（フィルターで事務所を選択してください）`。
- タブ UI の下に `VTuberDirectory`（Server Component）を配置し、見出し `事務所から探す` で全事務所をサーバーレンダリングする（フィルターの影響を受けない）。事務所ごとに `<details>`（初期は閉じる）で包み、`<summary>` 内の `<h2>` に事務所名・人数・開閉矢印を出す。中身は各メンバーへのリンク（`/vtuber/{channelId}`、名前＋登録者数）を丸チップで並べる。リンクは CSS で隠さず、閉じた `<details>` の中身として初期 HTML に含める。
- `/vtuber/[channelId]` は Server Component で `loadVTubers()` から詳細を取得し、存在しない `channelId` は `notFound()` で 404 を返す。データは `getCachedVTuberDetail()`（`"use cache"` + `cacheLife("hours")`）で 1 時間キャッシュする。
- 詳細ページは `generateMetadata` で個別 title/description/canonical を生成し、OGP 画像にチャンネルサムネイルを設定する。本文先頭に「誰が・何人・いつ時点」を含む要約文を置く。
- 詳細ページは `app/vtuber/[channelId]/opengraph-image.tsx` で動的 OGP 画像（1200x630）を生成し、`generateMetadata` の `openGraph.images` / `twitter.images` に設定する。`twitter.card` は `summary_large_image` を使う。
- 詳細表示は `VTuberTabs` の `Detail` を「取得（Detail）」と「表示（DetailView）」に分離し、一覧タブはクライアント取得したデータを `DetailView` へ渡す。詳細ページはサーバー取得したデータを `DetailView` へ直接渡す。
- 詳細ページにはパンくず（ホーム › VTuber › 名前）、`ProfilePage` + `Person` と `BreadcrumbList` の JSON-LD、同じ事務所の他メンバー（登録者数上位12人）へのリンクを表示する。
- 詳細の「登録者数の推移」と「最新動画」の間に `AffiliateLinks` を表示する（キーワード `${name} グッズ`、見出し横に `PR` バッジ、楽天ボタン1つ）。
- 選択事務所のメンバーを **1 人 1 タブ**で横並び。順序：事務所の初出順 → 各事務所内で `officeFlg == true` を先頭。
- 背景：選択中チャンネルのサムネをぼかして拡大＋暗いオーバーレイ。
- 詳細：サムネ・名前・事務所、登録者数・総再生数・動画本数、**登録者数推移の折れ線グラフ（30 日、`youtubeSubscriberCountTransition`）**、最新動画（最大 30 件、サムネ・お気に入り・再生）。
- 空/エラー: `Vtuberリストがありません` / `Vtuberリストの取得に失敗しました` / `Vtuberリストを読み込み中…`、チャート空 `データなし`、動画なし `動画データがありません`。
- 読み込み中（P0-7）: 一覧の取得中は `VTuberTabsSkeleton`（タブ列＋詳細）、詳細の取得中はタブ列を残したまま `VTuberDetailSkeleton` を表示する（`Vtuberリストを読み込み中…` はスクリーンリーダー用ラベルとしてのみ使う）。詳細の取得失敗は `VTuberの詳細を取得できませんでした`。
- 取得済みの詳細はクライアント側で保持し、タブのホバー／フォーカス時に先読みする。`/api/vtuber` と `/api/vtuber/[channelId]` は成功時のみ `Cache-Control: public, s-maxage=600, stale-while-revalidate=3600` で CDN にキャッシュする（エラー時は `no-store`）。

### 5.5 ランキング（3 カテゴリのタブ）
1. **週間同時視聴者数**（見出し `MM/dd 〜 MM/ddの同時視聴者数`＝今日から 6 日前〜今日、`weeklyLiveViewRanking.json`）
2. **YouTube 登録者数**（`rankingYoutubeRegiData.json`）
3. **動画本数**（`rankingVideoCountData.json`）
- 集計はサーバー側。フロントは取得済みの値で降順表示（選択チャンネルで絞り込み）。行：順位・サムネ・名前・事務所・数値。「トップへ戻る」FAB。
- 各タブ（登録者急上昇を含む）はサーバー側で表示項目だけの上位100件に絞る。追加の事務所別上位30件は含めないため、選択チャンネルの絞り込みはこの上位100件の範囲内となる。
- 初期表示は週間同時視聴者数のみを読み込み、他のランキングデータはタブ選択時に `/api/ranking` から取得する。
- `/ranking` の h1 直下に要約文（集計期間と1位）を表示し、ページ下部に `最終更新: yyyy/MM/dd HH:mm` を表示する。
- `/ranking` は表示中タブの TOP10 を JSON-LD `ItemList` で出力する。

### 5.6 チャット（掲示板）
- スレッド一覧は事務所タブ。事務所ごとにスレッド（Firestore `threads`）。**フィルターに関係なく全スレッドを出す**。並びは、選択中チャンネルを含む事務所のスレッド（事務所順、タブ名の前に ★）→ 残り（`lastUpdated` の新しい順）。選択が空なら全件 `lastUpdated` の新しい順。
- `📢 掲示板の注意事項` はスレッドタブとは分離した固定パネルで表示し、`詳しく見る` / `折りたたむ` で開閉する。
- スレッドタブはカード表示（投稿件数・未読 `+N` バッジ付き）。開いたスレッドは既読として未読数を更新する。
- 投稿一覧：レス番号、投稿者、時刻、`📰 Bot` バッジ（Bot 投稿）、本文、`返信` ボタン。本文内の `>>N` アンカーは対象レスへスクロール。返信アンカーを含む投稿は返信先プレビューを表示する。
- 投稿は親コメントごとに返信を束ねる。返信エリアはコネクタ線（縦ライン）付きで表示し、件数が多い場合は「返信をさらに表示」「返信を折りたたむ」で開閉できる。
- `投稿する` FAB は目立つグラデーション表示。投稿シートは名前欄あり（空は `投稿内容を入力してください`）。
- 各投稿に絵文字リアクション風 UI（ローカル表示のみ、サーバー保存なし）を表示する。
- 空状態: `スレッドがありません` / `まだ投稿がありません` / `いちばん最初のコメントをしてみよう！`
- 注意事項パネルに利用上の注意・モデレーション方針（日本語長文）を表示する。

### 5.7 イベントカレンダー
- `イベントカレンダー`。`table_calendar` 相当（日本語、2015〜2050）。イベントのある日にドット（最大 3、超過は `+N`）。
- `/events` は h1 直下に当日（JST）の要約文を置き、当日のイベント一覧（名前・事務所・種別・`/vtuber/{channelId}` リンク）をサーバーレンダリングして初期 HTML に含める。0件日は `今日のイベントはありません` を表示する。
- `EventCalendar` はマウント待ちの `読み込み中…` を返さず、サーバーから渡した JST の当日日付を初期選択にしてそのままカレンダー UI を表示する。
- 日付選択 → `yyyy年M月d日` 見出し＋イベント行（サムネ・名前・事務所・種別）。`/events/{MM-DD}` への詳細リンクを表示する。
- 種別ラベル：周年 `N周年`（`createdAt` からの経過年数）、`誕生日`、未来日 `未来のイベント`、不明 `不明`。
- 日付選択のイベント一覧の下に `AffiliateLinks` を 1 つだけ表示する（見出し `お祝いグッズを探す`、キーワードは先頭イベントの `${name} グッズ`、0件日は非表示）。
- `/events/[date]`（`MM-DD`、366ページ）は `generateStaticParams` で静的生成し、誕生日とデビュー記念日（周年）を分けて表示する。前日/翌日リンク、JSON-LD `ItemList`、一覧下の `AffiliateLinks` を出す。

### 5.8 お気に入り
- `お気に入り`。`favorites`（videoID）を `allvideos.json` から引いて一覧。個別削除 `お気に入りから削除しますか？`／全削除 `お気に入りを全て削除しますか？`（`はい`/`いいえ`）。空: `お気に入りの動画はありません。`

### 5.9 事務所選択
- 初回の事務所選択画面は表示しない。フィルターから事務所・個別 VTuber を選択できる。

### 5.10 設定（Option）
`設定` / `Push通知`（Web 非表示）/ `お知らせ`（`noticeJson`、New バッジ）/ `このアプリについて`: `共有する`・`アプリ情報`・`利用規約`・`お問い合わせ`（メール）・`おすすめVtuber`（メール）。
- アプリ情報は長い静的ページ。利用規約は現行ほぼプレースホルダー（Next.js 版で正式文面を用意）。
- `プライバシーポリシー・広告について`（`/privacy`）へのリンクを置く（AFF-2）。
- 問い合わせ先メールは `vchannel.com.info@gmail.com` を使用し、設定ページと `/privacy` で同じ宛先を表示する。

### 5.11 収益化（アフィリエイト）
- 提携状況（2026-11-11）: **楽天: 直接・利用中 / もしも: 再審査中 / Amazon: 未提携**。
- アフィリエイトリンクは `lib/affiliate.ts` の `buildRakutenAffiliateUrl` だけで生成する（URL の手書き禁止）。ID は `NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID` を優先し、未設定時は公開 ID `5964c172.78b60cce.5964c173.d6c6def5` を使う。
- 共通表示は `AffiliateLinks`（`PR` バッジ付き、`rel="nofollow sponsored noopener"`、楽天ボタン1つ）を使う。インプレッション画像は使わない。
- 設置箇所は VTuber 詳細（`登録者数の推移` と `最新動画` の間）とイベントカレンダー（日付選択のイベント一覧下）とする。
- 楽天モーションウィジェットは `RakutenMotionWidget` で表示し、楽天公式 `https://xml.affiliate.rakuten.co.jp/widget/js/rakuten_widget.js?20230106` を `<iframe srcDoc>` で隔離して描画する。`<base target="_blank">` を付け、リンクは新しいタブで開く。
- ウィジェットサイズは画面幅 640px 未満で `300x250`、640px 以上で `600x200`。`rakuten_size` も同じ値を使う。トップ `/` とランキング `/ranking` のページ下部に各1つ設置する。
- ウィジェットの商品設定は `rakuten_items="ranking"`、`rakuten_genreId="566382"`、`rakuten_recommend="off"`（おすすめ優先 off）を使う。
- ウィジェット枠にも `PR` バッジを表示する。
- `/privacy` は ASP 名を明記しない広告表記を掲載する。現行の掲載項目は「広告の掲載について」「アクセス解析（Vercel Analytics）」「ローカルストレージ」「お問い合わせ」「制定日（2026-11-09）」「改定日（2026-11-11）」。

---

## 6. 非機能・移行時の注意

- **料金**：RTDB の公開読み取りは禁止（過去に無認証スキャンで課金急増）。データ取得は GCS 公開 JSON を使う。`/vtuber` 全体（約 780KB）を RTDB から読まない。
- **キャッシュ**：JSON は 1 時間程度の鮮度で十分（更新は定期バッチ）。ライブ関連は `livevideoList.json` が 5 分周期で更新されるため、配信中タブは 1〜5 分の revalidate を推奨。
- **CORS**：GCS 公開 JSON はブラウザ直 fetch 可（`cors.json` 参照）。確認済みでなければ Next.js のサーバー側 fetch にする。
- **日時**：ISO8601(UTC) → `Asia/Tokyo` で表示・日付振り分け（今日/明日/明後日以降は JST 暦日で判定）。
- **型変換**：数値文字列（`concurrent_viewers`, `videoCount` 等）は数値化。キー名の揺れ（`videoID`/`videoId`, `channeID`/`channelId`/`youtubeChId`）に注意。
- **API キー**：YouTube API キー等を Next.js のクライアントに置かない（Cloud Functions 側にあり、再発行・環境変数化が未対応）。

### 6.1 SEO / AIO 方針（2026-11-09 策定）
- **入口ページはサーバーレンダリング必須**: `/vtuber/[channelId]`、`/vtuber`、`/events/[MM-DD]`、`/ranking`。
  - 主要テキスト（名前・数値・一覧）を初期 HTML に含める。
  - クライアント fetch だけで本文を描画しない。
- `/vtuber/[channelId]` は `cacheLife("hours")` の 1 時間キャッシュで更新し、`notFound()` を返せることを前提にメタデータ・要約文・JSON-LD をサーバーで出力する。
- **ページごとに固有の title / description / canonical** を `generateMetadata` で出す。共通タイトルは禁止。
- **要約文（answer-first）**: 入口ページの h1 直下に、1〜2 文で「誰が・何人・いつ時点」を言い切る文を置く。AI 検索や強調スニペットに引用されやすくするため。日付は必ず明記する。
- **構造化データ**:
  - 詳細: `ProfilePage` + `Person`、`BreadcrumbList`
  - 一覧・ランキング・日付ページ: `ItemList`
  - サイト全体: `WebSite` / `Organization`（layout）
  - JSON-LD は `<` をエスケープして出力する。
- **内部リンク**: 詳細ページ同士（同じ事務所のメンバー）、日付ページの前日・翌日、一覧から詳細へ、をすべて `<Link>`（`<a href>`）でつなぐ。`onClick` だけの遷移にはしない。
- **sitemap**: 静的ページ＋全 VTuber 詳細＋日付ページ（366 URL）を載せる。
- **robots**: AI クローラー（GPTBot / ClaudeBot / PerplexityBot 等）は許可を維持する。
- **`/llms.txt`**: AI 向けのサイト案内として提供する。
  - `text/plain; charset=utf-8` を返し、主要ページ案内・データ出典/更新頻度・登録者数上位50人の詳細URLを含める。

## 7. SPEC.md との差異（コード基準）
1. 下部ナビは 4 項目（ランキングは画面内タブバー）。SPEC.md は 5 タブ。
2. 過去アーカイブの「30 日以内」制限はコードに無い（今日より前すべて）。
3. 利用規約はプレースホルダー、全画面プレーヤーも最小実装。
4. バナー広告は未確認。実際はネイティブ広告＋タブ切替時のインタースティシャル（ネイティブのみ）。
5. `TabContent.dart` / `ThreadDetailPage.dart` は空ファイル。掲示板は `ThreadListPage.dart` に集約。
6. Analytics の `logEvent` 呼び出しなし。FCM トピック購読なし（通知はローカルスケジュール中心）。

## 8. 主な参照ソース
`lib/googleCloudFunctions.dart`（取得・キャッシュ）, `lib/common.dart`（共通処理・広告・Remote Config）, `lib/main.dart`（シェル・起動）, `lib/videoDistribution/*`, `lib/vtuberList.dart`, `lib/ranking.dart`, `lib/news/news.dart`, `lib/Chat/ThreadListPage.dart`, `lib/eventCalendar.dart`, `lib/sideMenu.dart`, `lib/favorite_screen.dart`, `lib/onboarding/office_selection_page.dart`, `lib/option/*`

## 9. 未確認事項（Next.js 着手前に確認）
- Firestore の本番ルール／Bot 投稿の判別フィールド名／`threads` の他フィールド。
- `rankingTwitterData.json` の UI 利用有無。
- GCS 公開 JSON の CORS 設定と実際の更新頻度。
- 現ライブ判定の厳密条件（`livevideoList.json` 生成側 `scheduledLiveDataUpdate` を参照）。
