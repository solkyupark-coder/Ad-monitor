// 유튜브 콜백: state 확인 → code를 refresh token으로 교환 → 채널·범위·만료를 확인해 한 번만 보여 준다(저장·캐시·로그 없음).
import { NextRequest } from "next/server";
import { BRANDS } from "@/lib/platforms";
import { esc, oauthPage, tokenBox } from "@/lib/oauth-page";
import { isBrand } from "@/lib/reddit-oauth";
import { exchangeGoogleCode, mineChannel, YOUTUBE_ANALYTICS_SCOPE, YOUTUBE_SCOPES, YOUTUBE_STATE_COOKIE, YOUTUBE_UPLOAD_SCOPE, youtubeRedirectUri } from "@/lib/youtube-oauth";

export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) => oauthPage(title, body, status, YOUTUBE_STATE_COOKIE);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const error = sp.get("error");
  if (error) return page("유튜브 연결이 취소됐습니다", `<p>구글이 돌려준 사유: <code>${esc(error)}</code></p>`, 400);
  const code = sp.get("code");
  const state = sp.get("state");
  const [savedState, brand, mode] = (req.cookies.get(YOUTUBE_STATE_COOKIE)?.value ?? "").split(".");
  if (!code || !state || !savedState || state !== savedState || !isBrand(brand ?? null)) {
    return page("유튜브 연결을 확인할 수 없습니다", "<p>연결 요청이 만료됐거나 다른 창에서 시작됐습니다(10분 제한). 대시보드의 '유튜브 연결하기'를 다시 눌러 주세요.</p>", 400);
  }
  const r = await exchangeGoogleCode(code, youtubeRedirectUri(req.nextUrl.origin));
  if (!r.ok) return page("유튜브 토큰 교환 실패", `<p>${esc(r.error)}</p>`, 502);

  if (mode === "upload") {
    // 업로드 권한만 요청한 흐름: 채널 조회(읽기 권한 필요)는 하지 않고, 권한 범위만 확인해 토큰을 한 번 보여 준다.
    const ok = r.scope.split(/\s+/).includes(YOUTUBE_UPLOAD_SCOPE);
    const name = `YT_UPLOAD_TOKEN_${brand === "topogenesis" ? "TOPO" : "HOUSCAPER"}`;
    return page(
      ok ? "유튜브 업로드 토큰 발급 완료" : "유튜브 업로드 권한이 빠졌습니다",
      ok
        ? `<ul><li class="ok">권한: youtube.upload (영상 올리기 전용, 조회·삭제 불가)</li></ul>${tokenBox(name, r.refreshToken)}<p class="warn">ad-monitor-mcp 프로젝트에 넣어야 합니다(이 대시보드가 아닙니다). 채팅이나 문서에 붙여넣지 마세요.</p>`
        : "<p>동의 화면에서 업로드 항목을 허용하지 않았습니다. 다시 연결하세요.</p>",
      ok ? 200 : 400,
    );
  }

  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const label = BRANDS.find((b) => b.id === brand)!.label;
  const expected = process.env[`${prefix}_YOUTUBE_CHANNEL_ID`] ?? "";
  const channel = await mineChannel(r.accessToken);
  const notes: string[] = [];
  if (!channel) {
    notes.push(`<li class="warn">이 구글 계정에 연결된 유튜브 채널을 찾지 못했습니다. 브랜드 채널이면 승인 화면에서 그 브랜드 계정을 골라야 합니다.</li>`);
  } else if (expected && channel.id !== expected) {
    notes.push(`<li class="warn">채널이 다릅니다: 발급된 채널 <code>${esc(channel.title)} (${esc(channel.id)})</code> / 등록된 ${esc(label)} 채널 <code>${esc(expected)}</code>. 다른 계정을 고른 것 같습니다 — 다시 연결하세요.</li>`);
  } else {
    notes.push(`<li class="ok">채널 확인: ${esc(channel.title)} (${esc(channel.id)})</li>`);
  }
  const scopes = r.scope.split(/\s+/).filter(Boolean);
  const extra = scopes.filter((x) => !YOUTUBE_SCOPES.includes(x));
  if (!scopes.includes(YOUTUBE_ANALYTICS_SCOPE)) notes.push(`<li class="warn">분석 권한(yt-analytics.readonly)이 빠졌습니다. 동의 화면에서 모든 항목에 체크하고 다시 연결해야 기간별 조회수·시청 시간이 보입니다.</li>`);
  if (!extra.length) notes.push(`<li class="ok">권한: ${scopes.map((x) => esc(x.split("/").pop() ?? x)).join(", ")} (읽기 전용)</li>`);
  else notes.push(`<li class="warn">권한이 읽기 전용보다 넓습니다: <code>${esc(r.scope)}</code>. myaccount.google.com/permissions 에서 이 앱 권한을 지운 뒤 다시 연결하면 읽기 전용만 받습니다.</li>`);
  if (r.refreshExpiresInSec) {
    const days = Math.round(r.refreshExpiresInSec / 86400);
    notes.push(`<li class="warn">이 refresh token은 약 ${days}일 뒤 만료됩니다. 구글 OAuth 동의 화면이 'Testing(테스트)' 상태라서입니다. Google Cloud 콘솔 → OAuth 동의 화면(대상) → '앱 게시'로 프로덕션에 올린 뒤 다시 연결하면 만료되지 않습니다.</li>`);
  } else {
    notes.push(`<li class="ok">만료 기한 없음(동의 화면이 프로덕션 상태)</li>`);
  }
  const mismatch = channel && expected && channel.id !== expected;
  return page(
    mismatch ? "유튜브 토큰 발급됨 — 채널 확인 필요" : "유튜브 refresh token 발급 완료",
    `<ul>${notes.join("")}</ul>${tokenBox(`${prefix}_YOUTUBE_REFRESH_TOKEN`, r.refreshToken)}<p class="warn">채팅이나 문서에 붙여넣지 마세요. 넣은 뒤 이 창을 닫으세요.</p>`,
  );
}
