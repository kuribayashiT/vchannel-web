import { NextResponse, type NextRequest } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";

/** 管理画面（/admin, /api/admin/*）の Basic 認証。FRONTEND_SPEC.md 5.12 */
export function proxy(request: NextRequest) {
  const result = checkAdminAuth(request.headers.get("authorization"));
  if (result === "disabled") {
    return new NextResponse("Not Found", { status: 404 });
  }
  if (result === "denied") {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="admin", charset="UTF-8"' },
    });
  }
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
