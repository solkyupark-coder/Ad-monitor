// 광고 효과 CSV 내려받기. 대시보드와 같은 계산(lib/dashboard)을 쓴다. 로그인 쿠키는 middleware가 막는다.
import { NextRequest } from "next/server";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { parseRange } from "@/lib/range";
import { loadDashboard } from "@/lib/dashboard";
import { effectCsv, exportData, exportFileName, parseExportOptions } from "@/lib/export";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("brand");
  const brand = BRANDS.find((b) => b.id === q)?.id as BrandId | undefined;
  if (!brand) return new Response("알 수 없는 brand 입니다", { status: 400, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const range = parseRange({ range: sp.get("range") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const opts = parseExportOptions(sp);
  // 유튜브는 쓰지 않고, 사이트 방문자(Vercel)는 '일별 흐름'을 담을 때만 읽는다.
  const data = exportData(await loadDashboard(brand, range, { youtube: true, vercel: !opts.parts.includes("daily"), combo: true }));
  return new Response(effectCsv(data, opts), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFileName(data, "csv")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
