// 유튜브 읽기 전용 OAuth: 승인 주소 만들기, code → refresh token 교환, 발급된 토큰의 채널 확인.
// 토큰 값은 로그에 남기지 않는다. 구글 OAuth 클라이언트(GOOGLE_OAUTH_CLIENT_ID/SECRET)를 쓴다.
export const YOUTUBE_STATE_COOKIE = "adm_youtube_oauth";
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const YOUTUBE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";
export const YOUTUBE_SCOPES = [YOUTUBE_SCOPE, YOUTUBE_ANALYTICS_SCOPE];

// 구글 클라이언트의 '승인된 리디렉션 URI'에 정확히 등록돼 있어야 한다.
export function youtubeRedirectUri(origin: string): string {
  return process.env.YOUTUBE_REDIRECT_URI || `${origin.replace(/\/+$/, "")}/api/youtube/callback`;
}

export function googleAuthorizeUrl(state: string, redirectUri: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "), // 읽기 전용 두 개(채널 현황 + 기간별 분석). include_granted_scopes는 보내지 않아 예전 넓은 권한이 합쳐지지 않게 한다
    access_type: "offline", // refresh token 받기
    prompt: "select_account consent", // 브랜드 채널 계정을 고를 수 있게, 매번 refresh token을 새로 받게
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export type YoutubeExchange =
  | { ok: true; refreshToken: string; accessToken: string; scope: string; refreshExpiresInSec: number | null }
  | { ok: false; error: string };

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<YoutubeExchange> {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) return { ok: false, error: "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET이 없습니다" };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string; refresh_token?: string; scope?: string; refresh_token_expires_in?: number; error?: string;
  };
  if (!res.ok || j.error) {
    const e = j.error ?? `http_${res.status}`;
    if (e === "invalid_grant") return { ok: false, error: "승인 코드가 만료됐거나 이미 쓰였습니다 — 다시 연결하세요 (invalid_grant)" };
    if (e === "redirect_uri_mismatch") return { ok: false, error: `구글 클라이언트에 리디렉션 URI ${redirectUri}가 등록돼 있지 않습니다 (redirect_uri_mismatch)` };
    if (e === "invalid_client") return { ok: false, error: "GOOGLE_OAUTH_CLIENT_SECRET이 클라이언트 ID와 맞지 않습니다 (invalid_client)" };
    return { ok: false, error: `토큰 교환 실패 (${e})` };
  }
  if (!j.refresh_token || !j.access_token) return { ok: false, error: "refresh token이 오지 않았습니다 — 다시 연결해 동의 화면을 끝까지 진행하세요" };
  return { ok: true, refreshToken: j.refresh_token, accessToken: j.access_token, scope: j.scope ?? "", refreshExpiresInSec: j.refresh_token_expires_in ?? null };
}

// 발급된 토큰이 어느 채널 것인지 확인한다(읽기 전용 호출).
export async function mineChannel(accessToken: string): Promise<{ id: string; title: string } | null> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { items?: { id: string; snippet?: { title?: string } }[] };
  const c = j.items?.[0];
  return c ? { id: c.id, title: c.snippet?.title ?? "" } : null;
}
