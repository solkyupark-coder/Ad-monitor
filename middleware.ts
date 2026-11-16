import { NextRequest, NextResponse } from "next/server";
import { COOKIE, sessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  // 요약 JSON(BRIEF_API_KEY)과 GA4 자유 조회(GA4_QUERY_KEY)는 쿠키가 아니라 라우트 안에서 키로 확인한다(아침 보고·ad-monitor-mcp가 서버에서 읽음).
  if (pathname === "/api/brief" || pathname === "/api/cron/brief" || pathname === "/api/ga4/query") return NextResponse.next();
  const password = process.env.DASHBOARD_PASSWORD;
  if (password) {
    const cookie = req.cookies.get(COOKIE)?.value;
    if (cookie && cookie === (await sessionToken(password))) {
      // 레딧 앱의 redirect가 사이트 루트라서, 승인 후 돌아온 '/?code=…&state=…'를 콜백 처리로 넘긴다.
      const sp = req.nextUrl.searchParams;
      if (pathname === "/" && (sp.has("code") || sp.has("error")) && sp.has("state")) {
        const url = req.nextUrl.clone();
        url.pathname = "/api/reddit/callback";
        return NextResponse.rewrite(url);
      }
      return NextResponse.next();
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
