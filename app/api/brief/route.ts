// 아침 판단 보고·ad-monitor-mcp가 읽는 요약 JSON. 로그인 쿠키 대신 BRIEF_API_KEY(Authorization: Bearer …)로만 연다.
// 키가 설정돼 있지 않으면 항상 닫혀 있다. 응답에는 토큰·계정 ID가 없다(lib/brief.ts).
import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { buildBrief } from "@/lib/brief";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (s: string) => createHash("sha256").update(s).digest();

function authorized(header: string | null, key: string | undefined): boolean {
  if (!key || key.length < 16 || !header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return !!m && timingSafeEqual(digest(m[1].trim()), digest(key));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });

export async function GET(req: NextRequest) {
  if (!authorized(req.headers.get("authorization"), process.env.BRIEF_API_KEY)) return json({ error: "unauthorized" }, 401);
  const sp = req.nextUrl.searchParams;
  const brands = (sp.get("brand") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is BrandId => BRANDS.some((b) => b.id === s));
  const brief = await buildBrief({ brands, range: { range: sp.get("range") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined } });
  return json(brief);
}
