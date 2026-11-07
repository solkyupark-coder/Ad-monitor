// 틱톡 연결 시작: 1회용 state를 쿠키에 저장하고 틱톡 승인 화면으로 보낸다. (대시보드 로그인 필요 — 미들웨어)
// ?mode=read(기본, 지표 읽기) | upload(ad-monitor-mcp 영상 올리기용)
import { NextRequest, NextResponse } from "next/server";
import { newState } from "@/lib/oauth-page";
import { isBrand } from "@/lib/reddit-oauth";
import { isTiktokMode, TIKTOK_STATE_COOKIE, tiktokAuthorizeUrl, tiktokRedirectUri } from "@/lib/tiktok-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand");
  if (!isBrand(brand)) return NextResponse.json({ error: "brand가 올바르지 않습니다" }, { status: 400 });
  if (!process.env.TIKTOK_CLIENT_KEY) return NextResponse.json({ error: "TIKTOK_CLIENT_KEY가 없습니다" }, { status: 503 });
  const m = req.nextUrl.searchParams.get("mode");
  const mode = isTiktokMode(m) ? m : "read";
  const state = newState();
  const res = NextResponse.redirect(tiktokAuthorizeUrl(state, tiktokRedirectUri(req.nextUrl.origin), mode));
  res.cookies.set(TIKTOK_STATE_COOKIE, `${state}.${brand}.${mode}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
