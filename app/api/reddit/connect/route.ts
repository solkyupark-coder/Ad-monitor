// 레딧 연결 시작: 1회용 state를 쿠키에 저장하고 레딧 승인 화면으로 보낸다. (대시보드 로그인 필요 — 미들웨어)
// ?mode=ads(기본, 광고 읽기) | posts(내 글·카르마 읽기) | post(ad-monitor-mcp 글 올리기용)
import { NextRequest, NextResponse } from "next/server";
import { newState } from "@/lib/oauth-page";
import { authorizeUrl, isBrand, isRedditMode, REDDIT_STATE_COOKIE, redditClient, redditRedirectUri } from "@/lib/reddit-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand");
  if (!isBrand(brand)) return NextResponse.json({ error: "brand가 올바르지 않습니다" }, { status: 400 });
  const client = redditClient(brand);
  if (!client) return NextResponse.json({ error: "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET이 없습니다" }, { status: 503 });
  const m = req.nextUrl.searchParams.get("mode");
  const mode = isRedditMode(m) ? m : "ads";
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(state, redditRedirectUri(req.nextUrl.origin), client.id, mode));
  res.cookies.set(REDDIT_STATE_COOKIE, `${state}.${brand}.${mode}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
