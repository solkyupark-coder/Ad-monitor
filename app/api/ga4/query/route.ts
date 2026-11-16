// 분석용 GA4 자유 조회(ad-monitor-mcp의 ga4_report 도구가 부른다). 로그인 쿠키 대신 Authorization: Bearer <GA4_QUERY_KEY>로만 연다.
// 키가 설정돼 있지 않으면 항상 닫혀 있다. 응답에는 토큰·계정 정보가 없다.
import { NextRequest } from "next/server";
import { bearerMatches } from "@/lib/brief-auth";
import { ga4Query, type Ga4QueryInput } from "@/lib/ga4-query";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });

export async function POST(req: NextRequest) {
  if (!bearerMatches(req.headers.get("authorization"), process.env.GA4_QUERY_KEY)) return json({ error: "unauthorized" }, 401);
  let body: Ga4QueryInput;
  try {
    body = (await req.json()) as Ga4QueryInput;
  } catch {
    return json({ ok: false, reason: "JSON 본문이 필요합니다" }, 400);
  }
  const result = await ga4Query(body);
  return json(result, result.ok ? 200 : 400);
}
