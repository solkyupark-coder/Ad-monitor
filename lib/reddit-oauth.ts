// 레딧 광고 API용 OAuth: 승인 주소 만들기와 code → refresh token 교환. 토큰 값은 로그에 남기지 않는다.
import { BRANDS, type BrandId } from "@/lib/platforms";

export const REDDIT_STATE_COOKIE = "adm_reddit_oauth";
export const REDDIT_SCOPE = "adsread"; // 읽기 전용

// 레딧 앱에 등록된 redirect URI와 정확히 같아야 한다. 기본은 요청이 들어온 사이트 주소(루트).
export function redditRedirectUri(origin: string): string {
  return (process.env.REDDIT_REDIRECT_URI || origin).replace(/\/+$/, "");
}

export function isBrand(v: string | null): v is BrandId {
  return BRANDS.some((b) => b.id === v);
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const q = new URLSearchParams({
    client_id: process.env.REDDIT_CLIENT_ID ?? "",
    response_type: "code",
    state,
    redirect_uri: redirectUri,
    duration: "permanent", // refresh token을 받으려면 필요
    scope: REDDIT_SCOPE,
  });
  return `https://www.reddit.com/api/v1/authorize?${q}`;
}

export type RedditExchange = { ok: true; refreshToken: string; scope: string } | { ok: false; error: string };

export async function exchangeCode(code: string, redirectUri: string): Promise<RedditExchange> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return { ok: false, error: "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET이 없습니다" };
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "ad-monitor/0.1 (read-only dashboard)",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { refresh_token?: string; scope?: string; error?: string };
  if (!res.ok || json.error) {
    const e = json.error ?? `http_${res.status}`;
    if (e === "invalid_grant") return { ok: false, error: "승인 코드가 만료됐거나 이미 쓰였습니다 — 다시 연결하세요 (invalid_grant)" };
    if (res.status === 401) return { ok: false, error: "REDDIT_CLIENT_ID와 REDDIT_CLIENT_SECRET이 맞지 않습니다 (401)" };
    return { ok: false, error: `토큰 교환 실패 (${e})` };
  }
  if (!json.refresh_token) return { ok: false, error: "refresh token이 오지 않았습니다 — duration=permanent 승인이 필요합니다" };
  return { ok: true, refreshToken: json.refresh_token, scope: json.scope ?? "" };
}
