// 레딧 연결 시작: 1회용 state를 쿠키에 저장하고 레딧 승인 화면으로 보낸다. (대시보드 로그인 필요 — 미들웨어)
import { NextRequest, NextResponse } from "next/server";
import { newState } from "@/lib/oauth-page";
import { authorizeUrl, isBrand, REDDIT_STATE_COOKIE, redditRedirectUri } from "@/lib/reddit-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand");
  if (!isBrand(brand)) return NextResponse.json({ error: "brand가 올바르지 않습니다" }, { status: 400 });
  if (!process.env.REDDIT_CLIENT_ID) return NextResponse.json({ error: "REDDIT_CLIENT_ID가 없습니다" }, { status: 503 });
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(state, redditRedirectUri(req.nextUrl.origin)));
  res.cookies.set(REDDIT_STATE_COOKIE, `${state}.${brand}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
