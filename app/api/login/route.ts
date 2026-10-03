import { NextRequest, NextResponse } from "next/server";
import { COOKIE, sessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.json({ error: "DASHBOARD_PASSWORD 미설정" }, { status: 503 });
  const form = await req.formData();
  const given = String(form.get("password") ?? "");
  if (given !== password) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=1";
    return NextResponse.redirect(url, 303);
  }
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(COOKIE, await sessionToken(password), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
