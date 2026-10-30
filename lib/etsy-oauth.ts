// 엣시 Open API v3 OAuth(PKCE): 승인 주소 만들기, code → refresh token 교환, 토큰 갱신.
// 앱 키는 ETSY_KEYSTRING + ETSY_SHARED_SECRET(2026-02부터 x-api-key는 "keystring:secret" 형식만 받는다). 토큰 값은 로그에 남기지 않는다.
export const ETSY_STATE_COOKIE = "adm_etsy_oauth";
export const ETSY_SCOPES = ["shops_r", "transactions_r", "listings_r", "profile_r"]; // 읽기 전용
const TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";

// 엣시 앱의 Callback URL에 정확히 등록돼 있어야 한다. 기본은 {사이트}/api/etsy/callback.
export function etsyRedirectUri(origin: string): string {
  return process.env.ETSY_REDIRECT_URI || `${origin.replace(/\/+$/, "")}/api/etsy/callback`;
}

export function etsyApiKey(): string | null {
  const k = process.env.ETSY_KEYSTRING;
  const s = process.env.ETSY_SHARED_SECRET;
  return k && s ? `${k}:${s}` : null;
}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// PKCE verifier: 43–128자 [A-Za-z0-9._~-]. 32바이트 base64url = 43자.
export function newVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function challengeOf(verifier: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

export function etsyAuthorizeUrl(state: string, challenge: string, redirectUri: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.ETSY_KEYSTRING ?? "",
    redirect_uri: redirectUri,
    scope: ETSY_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `https://www.etsy.com/oauth/connect?${q}`;
}

type TokenJson = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<{ status: number; json: TokenJson }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.ETSY_KEYSTRING ?? "", ...body }),
    cache: "no-store",
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as TokenJson };
}

export type EtsyExchange = { ok: true; refreshToken: string; accessToken: string } | { ok: false; error: string };

export async function exchangeEtsyCode(code: string, verifier: string, redirectUri: string): Promise<EtsyExchange> {
  if (!process.env.ETSY_KEYSTRING) return { ok: false, error: "ETSY_KEYSTRING이 없습니다" };
  const { status, json } = await tokenRequest({ grant_type: "authorization_code", redirect_uri: redirectUri, code, code_verifier: verifier });
  if (status >= 400 || json.error || !json.refresh_token || !json.access_token) {
    const e = json.error ?? `http_${status}`;
    if (e === "invalid_grant") return { ok: false, error: "승인 코드가 만료됐거나 이미 쓰였습니다 — 다시 연결하세요 (invalid_grant)" };
    return { ok: false, error: `토큰 교환 실패 (${e}${json.error_description ? `: ${json.error_description}` : ""})` };
  }
  return { ok: true, refreshToken: json.refresh_token, accessToken: json.access_token };
}

// refresh token → access token(1시간). 같은 서버 인스턴스에서는 만료 5분 전까지 재사용한다.
const cache = new Map<string, { token: string; until: number }>();

export type EtsyToken = { ok: true; token: string } | { ok: false; error: string };

export async function etsyToken(refreshToken: string): Promise<EtsyToken> {
  const hit = cache.get(refreshToken);
  if (hit && hit.until > Date.now()) return { ok: true, token: hit.token };
  const { status, json } = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  if (status >= 400 || json.error || !json.access_token) return { ok: false, error: json.error ?? `http_${status}` };
  cache.set(refreshToken, { token: json.access_token, until: Date.now() + ((json.expires_in ?? 3600) - 300) * 1000 });
  return { ok: true, token: json.access_token };
}
