// 브랜드별 신규 가입 수(읽기 전용, 개수만). Supabase auth.users 는 PostgREST 로 열려 있지 않으므로,
// 가입 시각 한 컬럼만 보이는 뷰(기본 이름 signups)를 읽는다 — 이메일·이름 같은 개인정보 컬럼은 읽지도, 화면에 내지도 않는다.
// 같은 브랜드의 결제 DB 접속 값({BRAND}_SUPABASE_URL / {BRAND}_SUPABASE_READONLY_KEY)을 쓴다. 키 값은 화면·로그에 내지 않는다.
// env: {BRAND}_SIGNUP_TABLE(기본 signups) · {BRAND}_SIGNUP_DATE_COLUMN(기본 created_at). 뷰 만드는 SQL 은 README 참고.
import type { BrandId } from "@/lib/platforms";
import { offsetMs, rangeInstants, type DateRange } from "@/lib/range";
import { localDateHour, type CountHour } from "@/lib/hourly";

export type SignupSummary =
  | {
      ok: true;
      count: number; // 조회 기간 신규 가입
      countPrev: number | null; // 직전 같은 길이 기간(오늘 보기는 하루가 안 끝나 null)
      days: { date: string; signups: number }[]; // 직전 기간 시작 ~ 기간 끝(없는 날은 행이 없다)
      hours: CountHour[]; // 1일 보기에서만: 시간별(전날부터)
      truncated: boolean; // 1000건을 넘어 일부만 읽음 — 수치가 실제보다 작다
    }
  | { ok: false; reason: string };

const PREFIX: Record<BrandId, string> = { houscaper: "HOUSCAPER", topogenesis: "TOPOGENESIS" };
const LIMIT = 1000;
const SAFE = /^[A-Za-z0-9_]+$/; // PostgREST 식별자는 영문·숫자·밑줄만(쿼리 조작 방지)

export const signupsConfigured = (brand: BrandId, env: Record<string, string | undefined> = process.env): boolean =>
  !!env[`${PREFIX[brand]}_SUPABASE_URL`] && !!env[`${PREFIX[brand]}_SUPABASE_READONLY_KEY`];

// 시각 목록 → 요약(순수 함수: 테스트하기 쉽게 따로 둔다).
export function summarizeSignups(times: number[], range: DateRange, offset: number, truncated: boolean): Extract<SignupSummary, { ok: true }> {
  const iso = (t: number) => new Date(t).toISOString();
  const byDay = new Map<string, number>();
  const byHour = new Map<string, CountHour>();
  for (const t of times) {
    const dh = localDateHour(iso(t), offset);
    if (!dh) continue;
    byDay.set(dh.date, (byDay.get(dh.date) ?? 0) + 1);
    const k = `${dh.date}|${dh.hour}`;
    const c = byHour.get(k) ?? { date: dh.date, hour: dh.hour, value: 0 };
    c.value += 1;
    byHour.set(k, c);
  }
  const days = [...byDay.entries()].map(([date, signups]) => ({ date, signups })).sort((a, b) => a.date.localeCompare(b.date));
  const inRange = (date: string, from: string, to: string) => date >= from && date <= to;
  const count = days.filter((d) => inRange(d.date, range.from, range.to)).reduce((a, d) => a + d.signups, 0);
  const prevCount = days.filter((d) => inRange(d.date, range.prev.from, range.prev.to)).reduce((a, d) => a + d.signups, 0);
  return {
    ok: true,
    count,
    countPrev: range.today ? null : prevCount,
    days,
    hours: [...byHour.values()].sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour),
    truncated,
  };
}

export async function signupSummary(brand: BrandId, range: DateRange): Promise<SignupSummary> {
  const prefix = PREFIX[brand];
  const url = (process.env[`${prefix}_SUPABASE_URL`] ?? "").replace(/\/+$/, "");
  const key = process.env[`${prefix}_SUPABASE_READONLY_KEY`];
  if (!url || !key) return { ok: false, reason: "자격증명 없음" };
  const table = process.env[`${prefix}_SIGNUP_TABLE`] || "signups";
  const dateCol = process.env[`${prefix}_SIGNUP_DATE_COLUMN`] || "created_at";
  if (![table, dateCol].every((s) => SAFE.test(s))) return { ok: false, reason: "가입 테이블·컬럼 이름 설정이 올바르지 않습니다" };
  const { since, until } = rangeInstants({ from: range.prev.from, to: range.to });
  try {
    const res = await fetch(`${url}/rest/v1/${table}?select=${dateCol}&${dateCol}=gte.${since.toISOString()}&${dateCol}=lt.${until.toISOString()}&order=${dateCol}.desc&limit=${LIMIT}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      next: { revalidate: 600 },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: `Supabase 키가 ${table} 읽기를 거절했습니다 — 읽기 전용 role에 select 권한을 주세요` };
    if (res.status === 404) return { ok: false, reason: `가입 집계용 뷰(${table})를 찾지 못함 — README의 SQL로 만들거나 ${prefix}_SIGNUP_TABLE에 기존 테이블 이름을 지정하세요` };
    if (!res.ok) return { ok: false, reason: `가입 조회 실패 — ${dateCol} 컬럼 이름 설정을 확인하세요` };
    const rows = (await res.json()) as Record<string, unknown>[];
    const times = rows.map((r) => Date.parse(String(r[dateCol] ?? ""))).filter((t) => !Number.isNaN(t));
    return summarizeSignups(times, range, offsetMs(), rows.length >= LIMIT);
  } catch {
    return { ok: false, reason: "가입 조회 실패(네트워크)" };
  }
}
