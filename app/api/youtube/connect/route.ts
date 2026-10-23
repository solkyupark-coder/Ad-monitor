// 유튜브 연결 시작: 1회용 state를 쿠키에 저장하고 구글 승인 화면으로 보낸다. (대시보드 로그인 필요 — 미들웨어)
import { NextRequest, NextResponse } from "next/server";
import { newState } from "@/lib/oauth-page";
import { isBrand } from "@/lib/reddit-oauth";
import { googleAuthorizeUrl, type GoogleConnectMode, YOUTUBE_STATE_COOKIE, youtubeRedirectUri } from "@/lib/youtube-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand");
  if (!isBrand(brand)) return NextResponse.json({ error: "brand가 올바르지 않습니다" }, { status: 400 });
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) return NextResponse.json({ error: "GOOGLE_OAUTH_CLIENT_ID가 없습니다" }, { status: 503 });
  const m = req.nextUrl.searchParams.get("mode");
  const mode: GoogleConnectMode = m === "upload" || m === "search" ? m : "read"; // upload: 업로드 전용 토큰, search: 구글 검색(Search Console) 토큰
  const state = newState();
  const res = NextResponse.redirect(googleAuthorizeUrl(state, youtubeRedirectUri(req.nextUrl.origin), mode));
  res.cookies.set(YOUTUBE_STATE_COOKIE, `${state}.${brand}${mode === "read" ? "" : `.${mode}`}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
