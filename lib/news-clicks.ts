import "server-only";
import { cacheLife } from "next/cache";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getDatabase, type Database } from "firebase-admin/database";

const APP_NAME = "news";
const DAY_MS = 86_400_000;

function parseServiceAccount(raw: string): ServiceAccount | null {
  try {
    const json = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(json) as ServiceAccount;
  } catch {
    return null;
  }
}

function getJstDayKey(base = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const get = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

function previousDayKey(dayKey: string): string {
  if (!/^\d{8}$/.test(dayKey)) return dayKey;
  const y = Number(dayKey.slice(0, 4));
  const m = Number(dayKey.slice(4, 6));
  const d = Number(dayKey.slice(6, 8));
  const ms = Date.parse(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+09:00`);
  if (!Number.isFinite(ms)) return dayKey;
  return getJstDayKey(new Date(ms - DAY_MS));
}

function toCountRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([id, count]) => /^[0-9a-z]{1,8}$/.test(id) && typeof count === "number" && Number.isFinite(count) && count > 0)
      .map(([id, count]) => [id, Math.floor(count as number)]),
  );
}

function getNewsDb(): Database | null {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const databaseUrl = process.env.FIREBASE_DATABASE_URL?.trim();
  if (!serviceAccountRaw || !databaseUrl) return null;

  const serviceAccount = parseServiceAccount(serviceAccountRaw);
  if (!serviceAccount) return null;

  let app = getApps().find((item) => item.name === APP_NAME);
  if (!app) {
    app = initializeApp(
      {
        credential: cert(serviceAccount),
        databaseURL: databaseUrl,
      },
      APP_NAME,
    );
  }
  return getDatabase(app);
}

export async function incrementNewsClick(id: string): Promise<void> {
  const db = getNewsDb();
  if (!db) return;
  try {
    const day = getJstDayKey();
    await db.ref(`newsClicks/${day}/${id}`).transaction((current) => {
      if (typeof current === "number" && Number.isFinite(current)) {
        return current + 1;
      }
      return 1;
    });
  } catch (error) {
    console.error("[news-click] increment failed", error);
  }
}

export async function getNewsClicks24h(): Promise<Record<string, number>> {
  "use cache";
  cacheLife({ stale: 600, revalidate: 600, expire: 3600 });

  const db = getNewsDb();
  if (!db) return {};

  try {
    const today = getJstDayKey();
    const yesterday = previousDayKey(today);
    const [todaySnap, yesterdaySnap] = await Promise.all([
      db.ref(`newsClicks/${today}`).once("value"),
      db.ref(`newsClicks/${yesterday}`).once("value"),
    ]);
    const total: Record<string, number> = {};
    for (const source of [toCountRecord(todaySnap.val()), toCountRecord(yesterdaySnap.val())]) {
      for (const [id, count] of Object.entries(source)) {
        total[id] = (total[id] ?? 0) + count;
      }
    }
    return total;
  } catch (error) {
    console.error("[news-click] read 24h failed", error);
    return {};
  }
}
