import { connection } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import {
  FEATURE_THEMES,
  getFeatureMaterials,
  type FeatureTheme,
} from "@/lib/admin/feature-data";

/** 週刊特集の材料（scripts/content/write-weekly-feature.mjs が使う）。FRONTEND_SPEC.md 5.12.3 */
export async function GET(request: Request) {
  await connection();
  if (checkAdminAuth(request.headers.get("authorization")) !== "ok") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const theme = new URL(request.url).searchParams.get("theme") ?? "";
  if (!FEATURE_THEMES.includes(theme as FeatureTheme)) {
    return Response.json(
      { error: `theme は ${FEATURE_THEMES.join(" / ")} のどれか` },
      { status: 400 },
    );
  }
  try {
    return Response.json(await getFeatureMaterials(theme as FeatureTheme));
  } catch (e) {
    console.error("[feature-data]", e);
    return Response.json({ error: "材料の取得に失敗しました" }, { status: 502 });
  }
}
