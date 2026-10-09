// OAuth 콜백 결과 화면(공통). 캐시하지 않고, 1회용 state 쿠키를 지운다. 토큰 값은 로그에 남기지 않는다.
import { NextResponse } from "next/server";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function newState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function oauthPage(title: string, body: string, status: number, clearCookie: string): NextResponse {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title>
<style>body{font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;max-width:640px;margin:10vh auto;padding:0 16px;line-height:1.5;color:#0b0b0b;background:#f9f9f7}
code,textarea{font-family:ui-monospace,monospace}textarea{width:100%;height:5.5em;font-size:14px;padding:8px;border:1px solid #c3c2b7;border-radius:8px}
.warn{color:#8a5a00}.ok{color:#006300}a{color:#2a78d6}li{margin:4px 0}</style></head><body><h1 style="font-size:20px">${esc(title)}</h1>${body}<p><a href="/">대시보드로 돌아가기</a></p></body></html>`;
  const res = new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0" } });
  res.cookies.set(clearCookie, "", { path: "/", maxAge: 0 });
  return res;
}

export function tokenBox(envName: string, token: string): string {
  return `<p>아래 값을 Vercel 환경변수 <code>${esc(envName)}</code>에 <b>Sensitive</b>로 넣고 재배포하세요. 이 화면은 다시 열 수 없고, 서버에 저장하거나 로그에 남기지 않았습니다.</p>
<textarea readonly onclick="this.select()">${esc(token)}</textarea>`;
}
