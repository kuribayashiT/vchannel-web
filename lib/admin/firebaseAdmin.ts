import "server-only";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getDatabase, type Database } from "firebase-admin/database";

const APP_NAME = "vchannel-admin";
const DEFAULT_DATABASE_URL = "https://vtuber-335811-default-rtdb.firebaseio.com";

export class AdminConfigError extends Error {}

/**
 * RTDB（管理者権限）を返す。呼ばれたときに初めて初期化するので、
 * 環境変数が無くても `next build` は通る。
 * FIREBASE_SERVICE_ACCOUNT: サービスアカウント JSON（Base64 または JSON 文字列そのまま）
 */
export function getAdminDb(): Database {
  let app = getApps().find((a) => a.name === APP_NAME);
  if (!app) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
    if (!raw) {
      throw new AdminConfigError("環境変数 FIREBASE_SERVICE_ACCOUNT が未設定です");
    }
    let account: ServiceAccount;
    try {
      const json = raw.startsWith("{")
        ? raw
        : Buffer.from(raw, "base64").toString("utf8");
      account = JSON.parse(json) as ServiceAccount;
    } catch {
      throw new AdminConfigError("FIREBASE_SERVICE_ACCOUNT を JSON として読めません");
    }
    app = initializeApp(
      {
        credential: cert(account),
        databaseURL: process.env.FIREBASE_DATABASE_URL ?? DEFAULT_DATABASE_URL,
      },
      APP_NAME,
    );
  }
  return getDatabase(app);
}
