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
| `officedataList.json` | `{ "<事務所名>": [VTuber, ...] }` | VTuber / 絞り込み / オンボーディング |
| `livevideoList.json` | `[Video, ...]`（配信中・予定・過去すべて） | 配信タブ全般 |
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
- ⚠ リポジトリ内 `firestore.rules` は 2022-03-07 で期限切れの全開放ルールのまま。**本番ルールを必ず確認**すること（Console 側で更新済みの可能性あり）。無認証・全開放の書き込みは荒らし・課金リスクあり。Next.js 版では Route Handler 経由で書き込み＋入力検証／レート制限を推奨。

### 2.3 Realtime Database
- 読み取りは `officeMapping` のみ（Firestore の事務所名 → 表示名の変換表、約 600B）。`office` ノードは管理画面が REST で読む。
- **RTDB ルールは `.read:false` を既定とし `officeMapping` / `office` のみ公開**（2026-11 に料金急増対策で変更済み）。Web から `/` などを読まないこと。

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
| `office_selection_seen` / `onboarding_done` | bool | 初回オンボーディング完了 |
| `favorites` | string[] | お気に入り動画の videoID |
| `cached*` / `lastUpdate_*` | JSON 文字列 / ISO 日時 | データキャッシュ（TTL 1 時間）。Next.js では不要（fetch キャッシュに任せる） |
| `interAdCount` | int | 広告カウンタ（Web 不要） |

グローバル状態（Provider）：`SelectedCategorie`（選択事務所・VTuber/チャンネル ID、事務所順）, `FavoriteVideoData`, `YoutubePlayerState`（再生中動画 ID）, `PushRegisterState`, `ChangeTopTitle`。

---

## 5. 画面仕様

### 5.0 アプリシェル
- 下部ナビ（現行 4 項目）：**配信 / ニュース / VTuber / チャット**。ランキングはシェル下部に無く、ランキング画面内に独自のタブバーがある（現行のねじれ。Next.js 版は 5 タブにそろえてよい）。
- 右上メニューから **フィルター（サイドメニュー）** を開く。ヘッダーに「設定（Option）」「お気に入り」「イベントカレンダー」への導線。
- 初回起動時は事務所選択（オンボーディング）を表示。
- 動画をタップすると画面下部の **YouTube プレーヤー** が出る（グローバル状態で動画 ID 管理）。YouTube 埋め込み不可時は WebView（Web では新規タブ）に遷移。
- 通知タップ/受信で動画ダイアログ（ネイティブのみ）。

### 5.1 サイドメニュー「フィルター」
- 検索: `VTuber名で検索...`（名前の部分一致、結果なし: `該当するVTuberが見つかりません`）。
- 事務所リスト：行タップで展開/折りたたみ、左の丸で事務所内全員をトグル。状態は 全選択=青塗り＋チェック / 一部=薄い青 / なし=グレー。
- `事務所を変更` でオンボーディング（編集モード）を開く。
- **選択中チャンネル ID が 配信・VTuber・ランキングの全データを絞り込む。**

### 5.2 配信タブ（5 サブタブ）
横スクロールタブ。**初期表示は「配信中」**（index 1）。Web ではスワイプ無効（タップのみ）。

| タブ | 抽出条件（`comparisonDay` をローカル時刻に変換） | 表示 | 空表示 |
|---|---|---|---|
| 過去アーカイブ | 今日より前 | 新しい順の一覧（30 日制限はコード上なし） | `配信済みの動画はありません` |
| 配信中 | 現在ライブ中（`actualStartTime` あり・`actualEndTime` 空） | 同時視聴者数 `concurrent_viewers` 付き | `配信中の動画はありません` |
| 今日の配信 | 今日 | **0〜23 時の時間帯別グルーピング** | `配信予定の動画はありません` |
| 明日の配信 | 明日 | 同上（時間帯別） | 同上 |
| 明日以降の配信 | 2 日後以降 | 日付順 | 同上／エラー `動画の読み込みに失敗しました。` |

- ローディング: `配信予定を読み込み中…`
- 共通：選択チャンネルで絞り込み。カード＝サムネイル・タイトル・チャンネル名・日時。タップで再生。お気に入りボタン。
- 予定動画（今日以降）には **通知スイッチ**（ネイティブのみ。Web では非表示でよい）。
- グリッド：幅 >1000px で 3 列、>600px で 2 列、それ以下 1 列。
- ネイティブ広告をリスト内に挿入（Web は AdSense 等で別途検討）。

### 5.3 ニュース
- 縦スクロールのカード一覧＋プルリフレッシュ。ローディング `ニュースを読み込み中…`、失敗 `ニュースデータの取得に失敗しました（空データ）` ＋ `再読み込み`。
- カード：媒体名（無ければ `ブログ記事`）、タイトル、公開日、サムネ（`urlToImage`）、`videoUrl` があれば動画サムネ/再生導線。
- タップ → 記事 URL を WebView（Web は外部リンク/別タブ。`news.json` の `url` は外部サイト）。
- 5 件ごとにネイティブ広告。検索・カテゴリ絞り込みなし。並び順は `news.json` の順（フロントで再ソートしていない）。

### 5.4 VTuber
- 選択事務所のメンバーを **1 人 1 タブ**で横並び。順序：事務所の初出順 → 各事務所内で `officeFlg == true` を先頭。
- 背景：選択中チャンネルのサムネをぼかして拡大＋暗いオーバーレイ。
- 詳細：サムネ・名前・事務所、登録者数・総再生数・動画本数、**登録者数推移の折れ線グラフ（30 日、`youtubeSubscriberCountTransition`）**、最新動画（最大 30 件、サムネ・お気に入り・再生）。
- 空/エラー: `Vtuberリストがありません` / `Vtuberリストの取得に失敗しました` / `Vtuberリストを読み込み中…`、チャート空 `データなし`、動画なし `動画データがありません`。

### 5.5 ランキング（3 カテゴリのタブ）
1. **週間同時視聴者数**（見出し `MM/dd 〜 MM/ddの同時視聴者数`＝今日から 6 日前〜今日、`weeklyLiveViewRanking.json`）
2. **YouTube 登録者数**（`rankingYoutubeRegiData.json`）
3. **動画本数**（`rankingVideoCountData.json`）
- 集計はサーバー側。フロントは取得済みの値で降順表示（選択チャンネルで絞り込み）。行：順位・サムネ・名前・事務所・数値。「トップへ戻る」FAB。

### 5.6 チャット（掲示板）
- 先頭タブ `📢 掲示板ルール`、以降は事務所タブ（選択事務所の順）。事務所ごとにスレッド（Firestore `threads`）。
- 投稿一覧：レス番号、投稿者、時刻、`📰 Bot` バッジ（Bot 投稿）、本文、`返信` ボタン。本文内の `>>N` アンカーと URL（WebView/外部リンク）を解析。
- `投稿する` FAB → ボトムシート（空は `投稿内容を入力してください`）。名前欄あり。
- 空状態: `スレッドがありません` / `まだ投稿がありません` / `右下のボタンから最初の投稿をしてみよう！`
- ルールタブに利用上の注意・モデレーション方針（日本語長文）。

### 5.7 イベントカレンダー
- `イベントカレンダー`。`table_calendar` 相当（日本語、2015〜2050）。イベントのある日にドット（最大 3、超過は `+N`）。
- 日付選択 → `yyyy年M月d日` 見出し＋イベント行（サムネ・名前・事務所・種別）。
- 種別ラベル：周年 `N周年`（`createdAt` からの経過年数）、`誕生日`、未来日 `未来のイベント`、不明 `不明`。広告なし。

### 5.8 お気に入り
- `お気に入り`。`favorites`（videoID）を `allvideos.json` から引いて一覧。個別削除 `お気に入りから削除しますか？`／全削除 `お気に入りを全て削除しますか？`（`はい`/`いいえ`）。空: `お気に入りの動画はありません。`

### 5.9 オンボーディング（事務所選択）
- 初回 `ようこそ！`／編集時 `事務所を変更`。説明: `気になる事務所を選んでください\nいつでも変更できます`。事務所・個別 VTuber を選択、`すべて選択` ボタン。保存先は `favoriteOffices`。

### 5.10 設定（Option）
`設定` / `Push通知`（Web 非表示）/ `お知らせ`（`noticeJson`、New バッジ）/ `このアプリについて`: `共有する`・`アプリ情報`・`利用規約`・`お問い合わせ`（メール）・`おすすめVtuber`（メール）。
- アプリ情報は長い静的ページ。利用規約は現行ほぼプレースホルダー（Next.js 版で正式文面を用意）。

---

## 6. 非機能・移行時の注意

- **料金**：RTDB の公開読み取りは禁止（過去に無認証スキャンで課金急増）。データ取得は GCS 公開 JSON を使う。`/vtuber` 全体（約 780KB）を RTDB から読まない。
- **キャッシュ**：JSON は 1 時間程度の鮮度で十分（更新は定期バッチ）。ライブ関連は `livevideoList.json` が 5 分周期で更新されるため、配信中タブは 1〜5 分の revalidate を推奨。
- **CORS**：GCS 公開 JSON はブラウザ直 fetch 可（`cors.json` 参照）。確認済みでなければ Next.js のサーバー側 fetch にする。
- **日時**：ISO8601(UTC) → `Asia/Tokyo` で表示・日付振り分け（今日/明日/明後日以降は JST 暦日で判定）。
- **型変換**：数値文字列（`concurrent_viewers`, `videoCount` 等）は数値化。キー名の揺れ（`videoID`/`videoId`, `channeID`/`channelId`/`youtubeChId`）に注意。
- **API キー**：YouTube API キー等を Next.js のクライアントに置かない（Cloud Functions 側にあり、再発行・環境変数化が未対応）。

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
