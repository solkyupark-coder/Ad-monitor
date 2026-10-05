// 구글 OAuth 공통: refresh token → access token. 토큰 값은 화면·로그에 내지 않는다(오류 코드만 남긴다).
export type GoogleToken = { ok: true; token: string } | { ok: false; error: string };

export async function googleToken(refreshToken: string): Promise<GoogleToken> {
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
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) return { ok: false, error: json.error ?? `http_${res.status}` };
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
