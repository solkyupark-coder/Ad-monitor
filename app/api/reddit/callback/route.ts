// 레딧 콜백: state 확인 → code를 refresh token으로 교환 → 한 번만 화면에 보여 준다(저장·캐시·로그 없음).
// 레딧 앱의 redirect가 사이트 루트라서, 미들웨어가 '/?code=…&state=…' 요청을 여기로 넘긴다.
import { NextRequest } from "next/server";
import { BRANDS } from "@/lib/platforms";
import { esc, oauthPage, tokenBox } from "@/lib/oauth-page";
import { exchangeCode, isBrand, isRedditMode, REDDIT_SCOPES, REDDIT_STATE_COOKIE, redditRedirectUri, type RedditMode } from "@/lib/reddit-oauth";

export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) => oauthPage(title, body, status, REDDIT_STATE_COOKIE);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const error = sp.get("error");
  if (error) return page("레딧 연결이 취소됐습니다", `<p>레딧이 돌려준 사유: <code>${esc(error)}</code></p>`, 400);
  const code = sp.get("code");
  const state = sp.get("state");
  const [savedState, brand, m] = (req.cookies.get(REDDIT_STATE_COOKIE)?.value ?? "").split(".");
  if (!code || !state || !savedState || state !== savedState || !isBrand(brand ?? null)) {
    return page("레딧 연결을 확인할 수 없습니다", "<p>연결 요청이 만료됐거나 다른 창에서 시작됐습니다(10분 제한). 대시보드의 '레딧 연결하기'를 다시 눌러 주세요.</p>", 400);
  }
  const mode: RedditMode = isRedditMode(m) ? m : "ads";
  const b = BRANDS.find((x) => x.id === brand)!;
  const result = await exchangeCode(b.id, code, redditRedirectUri(req.nextUrl.origin));
  if (!result.ok) return page("레딧 토큰 교환 실패", `<p>${esc(result.error)}</p>`, 502);
  const granted = result.scope.split(/[\s,]+/);
  const need = REDDIT_SCOPES[mode].split(" ");
  const lacking = need.filter((s) => !granted.includes(s));
  const scopeLine = `<p>승인된 범위: <code>${esc(result.scope || "(알 수 없음)")}</code>${lacking.length ? ` <span class="warn">— ${esc(lacking.join(", "))}가 없습니다. 기능이 일부 안 될 수 있습니다.</span>` : ""}</p>`;
  if (mode === "post") {
    const envName = `REDDIT_POST_TOKEN_${b.id === "topogenesis" ? "TOPO" : "HOUSCAPER"}`;
    return page(
      "레딧 글쓰기 토큰 발급 완료",
      `<p class="warn">이 값은 <b>ad-monitor-mcp</b> 프로젝트(대시보드 아님)에 넣으세요. 글을 올릴 수 있는 토큰입니다.</p>
${tokenBox(envName, result.refreshToken).replace("Vercel 환경변수", "Vercel <b>ad-monitor-mcp</b> 프로젝트 환경변수")}
${scopeLine}
<p class="fine">${b.prefix === "TOPOGENESIS" && process.env.TOPOGENESIS_REDDIT_CLIENT_ID ? "토포제네시스 전용 레딧 앱으로 발급했습니다. ad-monitor-mcp에 REDDIT_CLIENT_ID_TOPO / REDDIT_CLIENT_SECRET_TOPO도 같은 앱 값으로 넣어야 합니다." : "공통 레딧 앱으로 발급했습니다. ad-monitor-mcp에 REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET도 같은 앱 값으로 넣어야 합니다."}</p>
<p class="warn">채팅이나 문서에 붙여넣지 마세요. 넣은 뒤 이 창을 닫으세요.</p>`,
    );
  }
  const envName = `${b.prefix}_${mode === "posts" ? "REDDIT_USER_REFRESH_TOKEN" : "REDDIT_REFRESH_TOKEN"}`;
  return page(
    mode === "posts" ? "레딧 글·카르마 읽기 토큰 발급 완료" : "레딧 광고 읽기 토큰 발급 완료",
    `${tokenBox(envName, result.refreshToken)}
${scopeLine}
<p class="warn">채팅이나 문서에 붙여넣지 마세요. 넣은 뒤 이 창을 닫으세요.</p>`,
  );
}
