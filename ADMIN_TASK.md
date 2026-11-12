# ADMIN_TASK: 管理画面（/admin）のタスク

> 担当: Claude Code（実装・保守）。GitHub Copilot と自動開発パイプラインは**このファイルのタスクに着手しない**。
> 仕様は `FRONTEND_SPEC.md` 5.12。チェックボックス（`- [ ]`）は使わず、状態を絵文字で書く（✅ 完了 / 🔧 作業中 / ⏸ 人手待ち / 💡 案）。

## ⏸ 人手待ち（運営者が実施）

- ⏸ **ADM-0. Vercel の環境変数を設定する**（Production のみ）
  - `FIREBASE_SERVICE_ACCOUNT`: Firebase コンソール → プロジェクトの設定 → サービス アカウント → 新しい秘密鍵を生成。ダウンロードした JSON を `base64 -w0 key.json` で 1 行にした文字列（JSON そのままでも可）。鍵ファイルはリポジトリに置かない。
  - `ADMIN_USER` / `ADMIN_PASSWORD`: パスワードは長いランダム文字列にする（例 `openssl rand -base64 24`）。
  - 設定後に再デプロイ。どちらかが未設定の間、`/admin` は 404 になる。
- ⏸ **ADM-6D. 自動登録の関数を再デプロイする**（ADM-6 のバックエンド変更を反映）
  - `backend-repo` で `firebase deploy --only functions:scheduledVtuberDiscovery,functions:previewVtuberDiscovery`
  - 反映前は、管理画面で削除・却下したチャンネルが翌日の自動登録で戻ってくる。

## ✅ 完了

- ✅ **ADM-1. 土台**（2026-11-12）: `proxy.ts` の Basic 認証（未設定なら 404）、firebase-admin の遅延初期化、noindex・robots の `Disallow: /admin`。
- ✅ **ADM-2. 事務所ボード**（2026-11-12）: サイドバー＋事務所セクション、検索、絞り込み（自動登録のみ／未入力あり）、バッジ。
- ✅ **ADM-3. 編集パネルと保存 API**（2026-11-12）: フィールド単位の更新、`adminLog`、`profileSource: manual`、`?key=` での復元、Twitter 重複の警告。
- ✅ **ADM-4. ドラッグ＆ドロップで事務所変更**（2026-11-12）: セクション／サイドバーへドロップ、複数選択、元に戻す、失敗時のロールバック。
- ✅ **ADM-5. 事務所の名前変更・追加**（2026-11-12）
- ✅ **ADM-6. 自動登録の除外リスト（バックエンド）**（2026-11-12）: `vtuberDiscovery.js` が `vtuberDiscovery/excluded` を読み、候補から外す。※ デプロイは ADM-6D。
- ✅ **ADM-7. 削除と除外済みタブ**（2026-11-12）
- ✅ **ADM-8. 保留候補の登録・却下**（2026-11-12）

検証（2026-11-12）: `npx tsc --noEmit` / `npm run build` OK。本番ビルドで認証（未設定 404・未認証 401・認証 200・`X-Robots-Tag`）を確認。API をモックしたブラウザ操作で、D&D（セクション・サイドバー・複数選択）・元に戻す・保存・入力チェック・`?key=` を確認。**実データ（RTDB）での読み書きは ADM-0 の後に確認する。**

## 💡 案（未着手）

- 💡 `adminLog` の閲覧タブと、1 件ずつの取り消し。
- 💡 事務所の並び順（`office` ノード）をドラッグで入れ替える。
- 💡 保留候補・自動登録された人の YouTube 概要をパネル内で読めるようにする（判断材料）。
