// 브랜드별 신규 가입 수(읽기 전용, 일별 개수만). 각 Supabase 프로젝트의 RPC 함수 ad_monitor_signups_daily 를 부른다 —
// auth.users 를 직접 읽지도, 가입 시각·이메일을 받지도 않는다(함수가 날짜별 개수만 돌려준다).
// 같은 브랜드의 결제 DB 접속 값({BRAND}_SUPABASE_URL / {BRAND}_SUPABASE_READONLY_KEY)을 쓴다. 키 값은 화면·로그에 내지 않는다.
import type { BrandId } from "@/lib/platforms";
import { eachDay, offsetMs, type DateRange } from "@/lib/range";

export type SignupSummary =
  | {
      ok: true;
      count: number; // 조회 기간 신규 가입
      countPrev: number | null; // 직전 같은 길이 기간(오늘 보기는 하루가 안 끝나 null)
      days: { date: string; signups: number }[]; // 직전 기간 시작 ~ 기간 끝, 가입 0인 날은 0으로 채움
    }
  | { ok: false; reason: string };

const PREFIX: Record<BrandId, string> = { houscaper: "HOUSCAPER", topogenesis: "TOPOGENESIS" };
const MAX_DAYS = 400; // 함수가 받는 최대 범위(날짜 포함)

export const signupsConfigured = (brand: BrandId, env: Record<string, string | undefined> = process.env): boolean =>
  !!env[`${PREFIX[brand]}_SUPABASE_URL`] && !!env[`${PREFIX[brand]}_SUPABASE_READONLY_KEY`];

// 날짜 경계 시간대(IANA). 기본은 한국. DASHBOARD_UTC_OFFSET_HOURS 가 다르면 그에 맞는 Etc/GMT±N, DASHBOARD_TIMEZONE 이 있으면 그대로 쓴다.
export function signupTimezone(env: Record<string, string | undefined> = process.env, offsetHours = offsetMs() / 3600e3): string {
  const tz = (env.DASHBOARD_TIMEZONE ?? "").trim();
  if (/^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+){0,2}$/.test(tz)) return tz;
  if (offsetHours === 9) return "Asia/Seoul";
  if (offsetHours === 0) return "UTC";
  if (Number.isInteger(offsetHours) && Math.abs(offsetHours) <= 12) return `Etc/GMT${offsetHours > 0 ? "-" : "+"}${Math.abs(offsetHours)}`; // 부호가 반대(POSIX 표기)
  return "UTC";
}

// RPC 응답 행 → 요약(순수 함수: 테스트하기 쉽게 따로 둔다). 응답에 없는 날은 0으로 채운다.
export function summarizeSignups(rows: { day?: unknown; signups?: unknown }[], range: DateRange): Extract<SignupSummary, { ok: true }> {
  const by = new Map<string, number>();
  for (const r of rows) {
    const day = String(r.day ?? "").slice(0, 10);
    const n = Number(r.signups);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(n)) by.set(day, (by.get(day) ?? 0) + n);
  }
  const days = eachDay(range.prev.from, range.to).map((date) => ({ date, signups: by.get(date) ?? 0 }));
  const sum = (from: string, to: string) => days.filter((d) => d.date >= from && d.date <= to).reduce((a, d) => a + d.signups, 0);
  return { ok: true, count: sum(range.from, range.to), countPrev: range.today ? null : sum(range.prev.from, range.prev.to), days };
}

export async function signupSummary(brand: BrandId, range: DateRange): Promise<SignupSummary> {
  const prefix = PREFIX[brand];
  const url = (process.env[`${prefix}_SUPABASE_URL`] ?? "").replace(/\/+$/, "");
  const key = process.env[`${prefix}_SUPABASE_READONLY_KEY`];
  if (!url || !key) return { ok: false, reason: "자격증명 없음" };
  if (eachDay(range.prev.from, range.to).length > MAX_DAYS) return { ok: false, reason: `조회 범위가 ${MAX_DAYS}일을 넘어 가입 수를 읽지 않습니다` };
  try {
    const res = await fetch(`${url}/rest/v1/rpc/ad_monitor_signups_daily`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_from: range.prev.from, p_to: range.to, p_tz: signupTimezone() }),
      next: { revalidate: 600 },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "Supabase 키가 ad_monitor_signups_daily 실행을 거절했습니다 — 읽기 전용 키 role에 execute 권한을 확인하세요" };
    if (res.status === 404) return { ok: false, reason: "가입 집계 함수(ad_monitor_signups_daily)를 찾지 못함 — 이 브랜드 Supabase 프로젝트에 함수를 만들었는지 확인하세요" };
    if (!res.ok) return { ok: false, reason: "가입 조회 실패 — 함수 인자(p_from·p_to·p_tz)와 응답 형식을 확인하세요" };
    const rows = (await res.json()) as { day?: unknown; signups?: unknown }[];
    if (!Array.isArray(rows)) return { ok: false, reason: "가입 조회 응답 형식이 올바르지 않습니다" };
    return summarizeSignups(rows, range);
  } catch {
    return { ok: false, reason: "가입 조회 실패(네트워크)" };
  }
}
