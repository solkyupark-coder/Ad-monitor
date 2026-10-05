// 레딧 콜백: state 확인 → code를 refresh token으로 교환 → 한 번만 화면에 보여 준다(저장·캐시·로그 없음).
// 레딧 앱의 redirect가 사이트 루트라서, 미들웨어가 '/?code=…&state=…' 요청을 여기로 넘긴다.
import { NextRequest, NextResponse } from "next/server";
import { BRANDS } from "@/lib/platforms";
import { exchangeCode, isBrand, REDDIT_STATE_COOKIE, redditRedirectUri } from "@/lib/reddit-oauth";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title>
<style>body{font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;max-width:640px;margin:10vh auto;padding:0 16px;line-height:1.5;color:#0b0b0b;background:#f9f9f7}
code,textarea{font-family:ui-monospace,monospace}textarea{width:100%;height:5.5em;font-size:14px;padding:8px;border:1px solid #c3c2b7;border-radius:8px}
.warn{color:#8a5a00}a{color:#2a78d6}</style></head><body><h1 style="font-size:20px">${esc(title)}</h1>${body}<p><a href="/">대시보드로 돌아가기</a></p></body></html>`;
  const res = new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0" } });
  res.cookies.set(REDDIT_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const error = sp.get("error");
  if (error) return page("레딧 연결이 취소됐습니다", `<p>레딧이 돌려준 사유: <code>${esc(error)}</code></p>`, 400);
  const code = sp.get("code");
  const state = sp.get("state");
  const [savedState, brand] = (req.cookies.get(REDDIT_STATE_COOKIE)?.value ?? "").split(".");
  if (!code || !state || !savedState || state !== savedState || !isBrand(brand ?? null)) {
    return page("레딧 연결을 확인할 수 없습니다", "<p>연결 요청이 만료됐거나 다른 창에서 시작됐습니다(10분 제한). 대시보드의 '레딧 연결하기'를 다시 눌러 주세요.</p>", 400);
  }
  const result = await exchangeCode(code, redditRedirectUri(req.nextUrl.origin));
  if (!result.ok) return page("레딧 토큰 교환 실패", `<p>${esc(result.error)}</p>`, 502);
  const envName = `${BRANDS.find((b) => b.id === brand)!.prefix}_REDDIT_REFRESH_TOKEN`;
  const scopeOk = result.scope.split(/[\s,]+/).includes("adsread");
  return page(
    "레딧 refresh token 발급 완료",
    `<p>아래 값을 Vercel 환경변수 <code>${esc(envName)}</code>에 <b>Sensitive</b>로 넣고 재배포하세요. 이 화면은 다시 열 수 없고, 서버에 저장하거나 로그에 남기지 않았습니다.</p>
<textarea readonly onclick="this.select()">${esc(result.refreshToken)}</textarea>
<p>승인된 범위: <code>${esc(result.scope || "(알 수 없음)")}</code>${scopeOk ? "" : ' <span class="warn">— adsread가 없습니다. 광고 데이터 조회가 안 될 수 있습니다.</span>'}</p>
<p class="warn">채팅이나 문서에 붙여넣지 마세요. 넣은 뒤 이 창을 닫으세요.</p>`,
  );
}
