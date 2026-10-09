import { NextRequest, NextResponse } from "next/server";
import { COOKIE, sessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
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
