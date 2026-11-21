import { connection } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import {
  currentReportMonth,
  getMonthlyReport,
  todayReportDate,
} from "@/lib/reports";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 月報の解説文を自動で書くための材料（scripts/content/write-monthly-report.mjs が使う）。
 * /reports/[month] と同じ getMonthlyReport() を返すので、記事の数字はページの表と一致する。
 */
export async function GET(request: Request) {
  await connection();
  if (checkAdminAuth(request.headers.get("authorization")) !== "ok") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!MONTH_RE.test(month)) {
    return Response.json({ error: "month は YYYY-MM で指定してください" }, { status: 400 });
  }

  const asOfMonth = currentReportMonth();
  const asOfDate = todayReportDate();
  const [report, previous] = await Promise.all([
    getMonthlyReport(month, asOfMonth, asOfDate),
    getMonthlyReport(previousMonth(month), asOfMonth, asOfDate),
  ]);
  if (!report) {
    return Response.json({ error: "その月のレポートはありません" }, { status: 404 });
  }
  return Response.json({ report, previous });
}
