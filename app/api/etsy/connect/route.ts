// 엣시 연결 시작: 1회용 state와 PKCE verifier를 쿠키에 저장하고 엣시 승인 화면으로 보낸다. (대시보드 로그인 필요 — 미들웨어)
import { NextRequest, NextResponse } from "next/server";
import { newState } from "@/lib/oauth-page";
import { isBrand } from "@/lib/reddit-oauth";
import { challengeOf, ETSY_STATE_COOKIE, etsyAuthorizeUrl, etsyRedirectUri, newVerifier } from "@/lib/etsy-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand");
  if (!isBrand(brand)) return NextResponse.json({ error: "brand가 올바르지 않습니다" }, { status: 400 });
  if (!process.env.ETSY_KEYSTRING) return NextResponse.json({ error: "ETSY_KEYSTRING이 없습니다" }, { status: 503 });
  const state = newState();
  const verifier = newVerifier();
  const res = NextResponse.redirect(etsyAuthorizeUrl(state, await challengeOf(verifier), etsyRedirectUri(req.nextUrl.origin)));
  res.cookies.set(ETSY_STATE_COOKIE, `${state}.${brand}.${verifier}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
