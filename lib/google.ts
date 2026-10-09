// 구글 OAuth 공통: refresh token → access token. 토큰 값은 화면·로그에 내지 않는다(오류 코드만 남긴다).
export type GoogleToken = { ok: true; token: string } | { ok: false; error: string };

// access token을 서버 메모리에 잠시 둔다(디스크·로그·화면에 내지 않음). 요청마다 새 토큰을 받으면 Authorization 헤더가 매번 달라
// Next의 10분 데이터 캐시가 안 맞아 페이지·내보내기를 열 때마다 GA4·구글 광고 API를 다시 호출하게 된다.
const TOKEN_TTL_MARGIN_MS = 5 * 60 * 1000;
const tokenCache = new Map<string, { token: string; exp: number }>();
export const resetGoogleTokenCache = (): void => tokenCache.clear();

export async function googleToken(refreshToken: string): Promise<GoogleToken> {
  const hit = tokenCache.get(refreshToken);
  if (hit && hit.exp > Date.now()) return { ok: true, token: hit.token };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; expires_in?: number };
  if (!res.ok || !json.access_token) {
    tokenCache.delete(refreshToken);
    return { ok: false, error: json.error ?? `http_${res.status}` };
  }
  const ttl = Math.min(Math.max(0, (json.expires_in ?? 3600) * 1000 - TOKEN_TTL_MARGIN_MS), 50 * 60 * 1000);
  if (ttl > 0) {
    if (tokenCache.size >= 8) tokenCache.clear(); // 토큰 종류는 몇 개뿐이라 넉넉한 상한
    tokenCache.set(refreshToken, { token: json.access_token, exp: Date.now() + ttl });
  }
  return { ok: true, token: json.access_token };
}

// 토큰 갱신 오류 코드를 사람이 고칠 수 있는 문구로 바꾼다. envName 은 어떤 refresh token 인지 알려 주기 위한 이름.
export function tokenFailureReason(error: string, envName: string): string {
  if (error === "unauthorized_client") return `${envName}이 다른 OAuth 클라이언트로 발급됐습니다 — GOOGLE_OAUTH_CLIENT_ID와 같은 클라이언트로 다시 발급하세요 (unauthorized_client)`;
  if (error === "invalid_grant") return `${envName}이 만료되거나 취소됐습니다 — 다시 발급하세요. 동의 화면이 '테스트' 상태면 7일 뒤 만료됩니다 (invalid_grant)`;
  if (error === "invalid_client") return "GOOGLE_OAUTH_CLIENT_SECRET이 클라이언트 ID와 맞지 않습니다 (invalid_client)";
  return `토큰 갱신 실패 — ${envName}을 확인하세요 (${error})`;
}

// 실패 원인을 Vercel 런타임 로그에 남긴다. 비밀값은 넣지 않는다.
export function logFailure(scope: string, brand: string, detail: string): void {
  console.error(`[${scope}] ${brand}: ${detail}`);
}
