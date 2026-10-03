// D2: 사이트 전체를 단일 비밀번호로 잠근다. DASHBOARD_PASSWORD 미설정이면 닫힌 채로 실패(fail closed).
export const COOKIE = "adm_session";

export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`ad-monitor:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
