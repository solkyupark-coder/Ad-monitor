// 틱톡 콜백: state 확인 → code를 refresh token으로 교환 → 연결된 계정을 확인해 한 번만 보여 준다(저장·캐시·로그 없음).
import { NextRequest } from "next/server";
import { BRANDS } from "@/lib/platforms";
import { esc, oauthPage, tokenBox } from "@/lib/oauth-page";
import { isBrand } from "@/lib/reddit-oauth";
import { exchangeTiktokCode, isTiktokMode, TIKTOK_SCOPES, TIKTOK_STATE_COOKIE, tiktokRedirectUri, type TiktokMode } from "@/lib/tiktok-oauth";

export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) => oauthPage(title, body, status, TIKTOK_STATE_COOKIE);

async function accountName(accessToken: string): Promise<string | null> {
  const r = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name", { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { data?: { user?: { display_name?: string } } };
  return j.data?.user?.display_name ?? null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const error = sp.get("error");
  if (error) return page("틱톡 연결이 취소됐습니다", `<p>틱톡이 돌려준 사유: <code>${esc(error)}</code>${sp.get("error_description") ? ` — ${esc(sp.get("error_description")!)}` : ""}</p>`, 400);
  const code = sp.get("code");
  const state = sp.get("state");
  const [savedState, brand, m] = (req.cookies.get(TIKTOK_STATE_COOKIE)?.value ?? "").split(".");
  if (!code || !state || !savedState || state !== savedState || !isBrand(brand ?? null)) {
    return page("틱톡 연결을 확인할 수 없습니다", "<p>연결 요청이 만료됐거나 다른 창에서 시작됐습니다(10분 제한). 대시보드의 '틱톡 연결하기'를 다시 눌러 주세요.</p>", 400);
  }
  const mode: TiktokMode = isTiktokMode(m) ? m : "read";
  const r = await exchangeTiktokCode(code, tiktokRedirectUri(req.nextUrl.origin));
  if (!r.ok) return page("틱톡 토큰 교환 실패", `<p>${esc(r.error)}</p>`, 502);
  const b = BRANDS.find((x) => x.id === brand)!;
  const name = await accountName(r.accessToken);
  const granted = r.scope.split(/[\s,]+/);
  const lacking = TIKTOK_SCOPES[mode].split(",").filter((s) => !granted.includes(s));
  const who = name ? `<p class="ok">연결된 틱톡 계정: <b>${esc(name)}</b></p>` : '<p class="warn">계정 이름을 확인하지 못했습니다. 브랜드 계정으로 승인했는지 확인하세요.</p>';
  const scopeLine = `<p>승인된 범위: <code>${esc(r.scope || "(알 수 없음)")}</code>${lacking.length ? ` <span class="warn">— ${esc(lacking.join(", "))}가 없습니다. 틱톡 개발자 사이트에서 앱에 이 권한(제품)을 추가했는지 확인하세요.</span>` : ""}</p>`;
  const days = r.refreshExpiresInSec ? Math.round(r.refreshExpiresInSec / 86400) : 365;
  if (mode === "upload") {
    const envName = `TIKTOK_UPLOAD_TOKEN_${b.id === "topogenesis" ? "TOPO" : "HOUSCAPER"}`;
    return page(
      "틱톡 업로드 토큰 발급 완료",
      `${who}<p class="warn">이 값은 <b>ad-monitor-mcp</b> 프로젝트(대시보드 아님)에 넣으세요. 영상을 올릴 수 있는 토큰입니다.</p>
${tokenBox(envName, r.refreshToken).replace("Vercel 환경변수", "Vercel <b>ad-monitor-mcp</b> 프로젝트 환경변수")}
${scopeLine}
<p class="fine">ad-monitor-mcp에 TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET도 같은 앱 값으로 넣어야 합니다. 이 토큰은 약 ${days}일 쓸 수 있습니다. 틱톡 앱 심사(Content Posting API) 전에는 '나만 보기'로만 바로 게시됩니다.</p>
<p class="warn">채팅이나 문서에 붙여넣지 마세요. 넣은 뒤 이 창을 닫으세요.</p>`,
    );
  }
  const envName = `${b.prefix}_TIKTOK_REFRESH_TOKEN`;
  return page(
    "틱톡 읽기 토큰 발급 완료",
    `${who}
${tokenBox(envName, r.refreshToken)}
${scopeLine}
<p class="fine">이 토큰은 약 ${days}일 쓸 수 있습니다. 그 뒤에는 대시보드에서 다시 연결하세요.</p>
<p class="warn">채팅이나 문서에 붙여넣지 마세요. 넣은 뒤 이 창을 닫으세요.</p>`,
  );
}
