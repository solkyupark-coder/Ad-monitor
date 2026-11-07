// 틱톡 로그인 키트(OAuth v2): 승인 주소 만들기, code → refresh token 교환, 토큰 갱신.
// mode
//  - read   : 계정·영상 지표 읽기 → {BRAND}_TIKTOK_REFRESH_TOKEN (대시보드)
//  - upload : 영상 올리기(초안함 업로드 + 바로 게시) → ad-monitor-mcp 프로젝트의 TIKTOK_UPLOAD_TOKEN_{TOPO|HOUSCAPER}
// 앱 키는 TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET(developers.tiktok.com 앱). 토큰 값은 로그에 남기지 않는다.
export const TIKTOK_STATE_COOKIE = "adm_tiktok_oauth";
export type TiktokMode = "read" | "upload";
export const TIKTOK_SCOPES: Record<TiktokMode, string> = {
  read: "user.info.basic,user.info.profile,user.info.stats,video.list",
  upload: "user.info.basic,video.upload,video.publish",
};
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

export const isTiktokMode = (v: string | null | undefined): v is TiktokMode => v === "read" || v === "upload";

// 틱톡 앱의 Redirect URI에 정확히 등록돼 있어야 한다. 기본은 {사이트}/api/tiktok/callback.
export function tiktokRedirectUri(origin: string): string {
  return process.env.TIKTOK_REDIRECT_URI || `${origin.replace(/\/+$/, "")}/api/tiktok/callback`;
}

export function tiktokAuthorizeUrl(state: string, redirectUri: string, mode: TiktokMode): string {
  const q = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
    response_type: "code",
    scope: TIKTOK_SCOPES[mode],
    redirect_uri: redirectUri,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

type TokenJson = { access_token?: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; open_id?: string; scope?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<{ status: number; json: TokenJson }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY ?? "", client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", ...body }),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return { status: 0, json: { error: "network" } };
  return { status: res.status, json: (await res.json().catch(() => ({}))) as TokenJson };
}

export type TiktokExchange =
  | { ok: true; refreshToken: string; accessToken: string; scope: string; refreshExpiresInSec: number | null }
  | { ok: false; error: string };

export async function exchangeTiktokCode(code: string, redirectUri: string): Promise<TiktokExchange> {
  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) return { ok: false, error: "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET이 없습니다" };
  const { status, json } = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (status >= 400 || json.error || !json.refresh_token || !json.access_token) {
    const e = json.error ?? `http_${status}`;
    if (e === "invalid_grant") return { ok: false, error: "승인 코드가 만료됐거나 이미 쓰였습니다 — 다시 연결하세요 (invalid_grant)" };
    return { ok: false, error: `토큰 교환 실패 (${e}${json.error_description ? `: ${json.error_description}` : ""})` };
  }
  return { ok: true, refreshToken: json.refresh_token, accessToken: json.access_token, scope: json.scope ?? "", refreshExpiresInSec: json.refresh_expires_in ?? null };
}

// refresh token → access token(24시간). 같은 서버 인스턴스에서는 만료 10분 전까지 재사용한다.
const cache = new Map<string, { token: string; until: number }>();
export async function tiktokToken(refreshToken: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const hit = cache.get(refreshToken);
  if (hit && hit.until > Date.now()) return { ok: true, token: hit.token };
  const { status, json } = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  if (status >= 400 || json.error || !json.access_token) return { ok: false, error: json.error ?? `http_${status}` };
  cache.set(refreshToken, { token: json.access_token, until: Date.now() + ((json.expires_in ?? 86400) - 600) * 1000 });
  return { ok: true, token: json.access_token };
}
