// 레딧 콜백: state 확인 → code를 refresh token으로 교환 → 한 번만 화면에 보여 준다(저장·캐시·로그 없음).
// 레딧 앱의 redirect가 사이트 루트라서, 미들웨어가 '/?code=…&state=…' 요청을 여기로 넘긴다.
import { NextRequest } from "next/server";
import { BRANDS } from "@/lib/platforms";
import { esc, oauthPage, tokenBox } from "@/lib/oauth-page";
import { exchangeCode, isBrand, REDDIT_STATE_COOKIE, redditRedirectUri } from "@/lib/reddit-oauth";

export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) => oauthPage(title, body, status, REDDIT_STATE_COOKIE);

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
    `${tokenBox(envName, result.refreshToken)}
<p>승인된 범위: <code>${esc(result.scope || "(알 수 없음)")}</code>${scopeOk ? "" : ' <span class="warn">— adsread가 없습니다. 광고 데이터 조회가 안 될 수 있습니다.</span>'}</p>
<p class="warn">채팅이나 문서에 붙여넣지 마세요. 넣은 뒤 이 창을 닫으세요.</p>`,
  );
}
