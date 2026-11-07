// 레딧 OAuth: 승인 주소 만들기와 code → refresh token 교환. 토큰 값은 로그에 남기지 않는다.
// mode
//  - ads   : 광고 성과 읽기(adsread) → {BRAND}_REDDIT_REFRESH_TOKEN (대시보드)
//  - posts : 내 계정 글·카르마 읽기(identity history read) → {BRAND}_REDDIT_USER_REFRESH_TOKEN (대시보드)
//  - post  : 글 올리기(identity submit read flair) → ad-monitor-mcp 프로젝트의 REDDIT_POST_TOKEN_{TOPO|HOUSCAPER}
// 대시보드는 계속 읽기 전용이다. 글쓰기 토큰은 대시보드에 넣지 않고 ad-monitor-mcp에만 넣는다.
import { BRANDS, type BrandId } from "@/lib/platforms";

export const REDDIT_STATE_COOKIE = "adm_reddit_oauth";
export type RedditMode = "ads" | "posts" | "post";
export const REDDIT_SCOPES: Record<RedditMode, string> = {
  ads: "adsread",
  posts: "identity history read",
  post: "identity submit read flair",
};
export const UA = "web:ad-monitor:0.3 (brand dashboard)";

export function isRedditMode(v: string | null | undefined): v is RedditMode {
  return v === "ads" || v === "posts" || v === "post";
}

// 레딧 앱에 등록된 redirect URI와 정확히 같아야 한다. 기본은 요청이 들어온 사이트 주소(루트).
export function redditRedirectUri(origin: string): string {
  return (process.env.REDDIT_REDIRECT_URI || origin).replace(/\/+$/, "");
}

export function isBrand(v: string | null): v is BrandId {
  return BRANDS.some((b) => b.id === v);
}

// 브랜드 전용 레딧 앱({BRAND}_REDDIT_CLIENT_ID/SECRET)이 있으면 그것을, 없으면 공통 앱(REDDIT_CLIENT_ID/SECRET)을 쓴다.
export function redditClient(brand: BrandId): { id: string; secret: string; own: boolean } | null {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const id = process.env[`${prefix}_REDDIT_CLIENT_ID`];
  const secret = process.env[`${prefix}_REDDIT_CLIENT_SECRET`];
  if (id && secret) return { id, secret, own: true };
  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) return { id: process.env.REDDIT_CLIENT_ID, secret: process.env.REDDIT_CLIENT_SECRET, own: false };
  return null;
}

export function authorizeUrl(state: string, redirectUri: string, clientId: string, mode: RedditMode = "ads"): string {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    state,
    redirect_uri: redirectUri,
    duration: "permanent", // refresh token을 받으려면 필요
    scope: REDDIT_SCOPES[mode],
  });
  return `https://www.reddit.com/api/v1/authorize?${q}`;
}

export type RedditExchange = { ok: true; refreshToken: string; scope: string } | { ok: false; error: string };

export async function exchangeCode(brand: BrandId, code: string, redirectUri: string): Promise<RedditExchange> {
  const c = redditClient(brand);
  if (!c) return { ok: false, error: "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET이 없습니다" };
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": UA,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { refresh_token?: string; scope?: string; error?: string };
  if (!res.ok || json.error) {
    const e = json.error ?? `http_${res.status}`;
    if (e === "invalid_grant") return { ok: false, error: "승인 코드가 만료됐거나 이미 쓰였습니다 — 다시 연결하세요 (invalid_grant)" };
    if (res.status === 401) return { ok: false, error: "레딧 앱 ID와 secret이 맞지 않습니다 (401)" };
    return { ok: false, error: `토큰 교환 실패 (${e})` };
  }
  if (!json.refresh_token) return { ok: false, error: "refresh token이 오지 않았습니다 — duration=permanent 승인이 필요합니다" };
  return { ok: true, refreshToken: json.refresh_token, scope: json.scope ?? "" };
}

// refresh token → access token(1시간). 같은 서버 인스턴스에서는 만료 5분 전까지 재사용한다.
const cache = new Map<string, { token: string; until: number }>();
export async function redditAccessToken(brand: BrandId, refreshToken: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const hit = cache.get(refreshToken);
  if (hit && hit.until > Date.now()) return { ok: true, token: hit.token };
  const c = redditClient(brand);
  if (!c) return { ok: false, error: "no_client" };
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": UA,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return { ok: false, error: "network" };
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) return { ok: false, error: j.error ?? `http_${res.status}` };
  cache.set(refreshToken, { token: j.access_token, until: Date.now() + ((j.expires_in ?? 3600) - 300) * 1000 });
  return { ok: true, token: j.access_token };
}
