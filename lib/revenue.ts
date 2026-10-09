// 실제 결제 기준 매출(읽기 전용). 두 브랜드 모두 Polar 주문(브랜드별 조직 토큰)이 기준이고,
// 브랜드 Supabase purchase 테이블은 함께 있으면 대조값, Polar 토큰이 없으면 대체값이다.
// 토큰·키 값은 화면·로그에 내지 않는다.
import type { BrandId } from "@/lib/platforms";
import { offsetMs, rangeInstants, type DateRange } from "@/lib/range";
import type { CountHour } from "@/lib/hourly";

export type RevenueSummary =
  | {
      ok: true;
      source: "polar" | "supabase";
      currency: string;
      orders: number;
      amount: number | null;
      truncated: boolean;
      alt?: RevenueSummary; // Polar 기준일 때 Supabase purchase 대조값(자격증명이 있을 때만)
    }
  | { ok: false; reason: string };

const ZERO_DECIMAL = new Set(["KRW", "JPY", "VND", "CLP", "ISK", "UGX", "XAF", "XOF"]);

type PolarOrder = { created_at?: string; status?: string; paid?: boolean; net_amount?: number; total_amount?: number; currency?: string };

// 브랜드별 Polar 토큰 env 이름. 조직 토큰은 그 조직 주문만 보이므로 브랜드가 섞이지 않는다.
export const POLAR_TOKEN_ENV: Record<BrandId, string> = {
  houscaper: "POLAR_ACCESS_TOKEN",
  topogenesis: "TOPOGENESIS_POLAR_ACCESS_TOKEN",
};

type PolarFetch = { ok: true; paid: PolarOrder[]; truncated: boolean } | { ok: false; reason: string };

// [since, until) 에 만들어진 결제 완료 주문들.
async function polarPaid(tokenEnv: string, since: Date, until: Date): Promise<PolarFetch> {
  const token = process.env[tokenEnv];
  if (!token) return { ok: false, reason: "자격증명 없음" };
  const mine: PolarOrder[] = [];
  let truncated = false;
  try {
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(`https://api.polar.sh/v1/orders/?limit=100&page=${page}&sorting=-created_at`, {
        headers: { authorization: `Bearer ${token}` },
        next: { revalidate: 600 },
      });
      if (res.status === 401 || res.status === 403) return { ok: false, reason: `Polar 토큰 거절(${tokenEnv}) — 읽기 전용 토큰과 권한(orders:read)을 확인하세요` };
      if (!res.ok) return { ok: false, reason: "Polar 조회 실패" };
      const json = (await res.json()) as { items?: PolarOrder[] };
      const items = json.items ?? [];
      let reachedOld = false;
      for (const o of items) {
        const t = o.created_at ? new Date(o.created_at).getTime() : NaN;
        if (Number.isNaN(t)) continue;
        if (t < since.getTime()) reachedOld = true;
        else if (t < until.getTime()) mine.push(o);
      }
      if (reachedOld || items.length < 100) break;
      if (page === 20) truncated = true;
    }
  } catch {
    return { ok: false, reason: "Polar 조회 실패(네트워크)" };
  }
  // 결제 완료된 주문만. paid 필드가 없으면 status 로 판단한다.
  return { ok: true, paid: mine.filter((o) => o.paid ?? o.status === "paid"), truncated };
}

async function polar(tokenEnv: string, range: DateRange): Promise<RevenueSummary> {
  const { since, until } = rangeInstants(range);
  const r = await polarPaid(tokenEnv, since, until);
  if (!r.ok) return r;
  const paid = r.paid;
  const currency = (paid[0]?.currency ?? "usd").toUpperCase();
  const minor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  const amount = paid.filter((o) => (o.currency ?? "usd").toUpperCase() === currency).reduce((a, o) => a + (o.net_amount ?? o.total_amount ?? 0), 0) / minor;
  return { ok: true, source: "polar", currency, orders: paid.length, amount, truncated: r.truncated };
}

async function supabasePurchases(prefix: string, range: DateRange): Promise<RevenueSummary> {
  const url = (process.env[`${prefix}_SUPABASE_URL`] ?? "").replace(/\/+$/, "");
  const key = process.env[`${prefix}_SUPABASE_READONLY_KEY`];
  if (!url || !key) return { ok: false, reason: "자격증명 없음" };
  const table = process.env[`${prefix}_PURCHASE_TABLE`] || "purchase";
  const dateCol = process.env[`${prefix}_PURCHASE_DATE_COLUMN`] || "created_at";
  const amountCol = process.env[`${prefix}_PURCHASE_AMOUNT_COLUMN`] ?? "amount";
  const currency = (process.env[`${prefix}_PURCHASE_CURRENCY`] || "KRW").toUpperCase();
  const divisor = Number(process.env[`${prefix}_PURCHASE_AMOUNT_DIVISOR`] || 1) || 1;
  // PostgREST 식별자는 영문·숫자·밑줄만 허용해 쿼리 조작을 막는다.
  if (![table, dateCol, amountCol].every((s) => s === "" || /^[A-Za-z0-9_]+$/.test(s))) return { ok: false, reason: "테이블·컬럼 이름 설정이 올바르지 않습니다" };
  const { since, until } = rangeInstants(range);
  const select = amountCol ? `${dateCol},${amountCol}` : dateCol;
  const q = `select=${select}&${dateCol}=gte.${since.toISOString()}&${dateCol}=lt.${until.toISOString()}&order=${dateCol}.desc&limit=1000`;
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${q}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      next: { revalidate: 600 },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "Supabase 키 거절 — 읽기 전용 키와 RLS 정책을 확인하세요" };
    if (res.status === 404) return { ok: false, reason: "purchase 테이블을 찾지 못함 — 테이블 이름 설정을 확인하세요" };
    if (!res.ok) return { ok: false, reason: "Supabase 조회 실패 — 컬럼 이름 설정을 확인하세요" };
    const rows = (await res.json()) as Record<string, unknown>[];
    const amount = amountCol ? rows.reduce((a, r) => a + (Number(r[amountCol]) || 0), 0) / divisor : null;
    return { ok: true, source: "supabase", currency, orders: rows.length, amount, truncated: rows.length >= 1000 };
  } catch {
    return { ok: false, reason: "Supabase 조회 실패(네트워크)" };
  }
}

// 브랜드별 Supabase purchase env 접두사: {PREFIX}_SUPABASE_URL, {PREFIX}_SUPABASE_READONLY_KEY, {PREFIX}_PURCHASE_*.
const SUPABASE_PREFIX: Record<BrandId, string> = { houscaper: "HOUSCAPER", topogenesis: "TOPOGENESIS" };
const hasSupabase = (prefix: string) =>
  !!process.env[`${prefix}_SUPABASE_URL`] && !!process.env[`${prefix}_SUPABASE_READONLY_KEY`];

// Polar 우선. Supabase 자격증명도 있으면 대조값으로 같이 읽고, Polar 토큰이 없으면 Supabase가 실매출이 된다.
export async function revenueSummary(brand: BrandId, range: DateRange): Promise<RevenueSummary> {
  const tokenEnv = POLAR_TOKEN_ENV[brand];
  const prefix = SUPABASE_PREFIX[brand];
  if (!process.env[tokenEnv] && hasSupabase(prefix)) return supabasePurchases(prefix, range);
  const [main, alt] = await Promise.all([polar(tokenEnv, range), hasSupabase(prefix) ? supabasePurchases(prefix, range) : undefined]);
  return main.ok && alt ? { ...main, alt } : main;
}

// 일별 결제 건수(그래프용): 직전 기간 시작부터 기간 끝까지. 날짜 경계는 DASHBOARD_UTC_OFFSET_HOURS.
// 그래프에서 '결제가 있었던 날' 표시에만 쓰며, 합계는 revenueSummary 가 기준이다.
export type RevenueDays = { ok: true; source: "polar" | "supabase"; days: { date: string; orders: number }[]; hours: CountHour[]; truncated: boolean } | { ok: false; reason: string };

const localDate = (t: number) => new Date(t + offsetMs()).toISOString().slice(0, 10);
const localHour = (t: number) => new Date(t + offsetMs()).getUTCHours();

async function supabaseDates(prefix: string, since: Date, until: Date): Promise<{ ok: true; dates: number[]; truncated: boolean } | { ok: false; reason: string }> {
  const url = (process.env[`${prefix}_SUPABASE_URL`] ?? "").replace(/\/+$/, "");
  const key = process.env[`${prefix}_SUPABASE_READONLY_KEY`];
  if (!url || !key) return { ok: false, reason: "자격증명 없음" };
  const table = process.env[`${prefix}_PURCHASE_TABLE`] || "purchase";
  const dateCol = process.env[`${prefix}_PURCHASE_DATE_COLUMN`] || "created_at";
  if (![table, dateCol].every((s) => /^[A-Za-z0-9_]+$/.test(s))) return { ok: false, reason: "테이블·컬럼 이름 설정이 올바르지 않습니다" };
  try {
    const res = await fetch(`${url}/rest/v1/${table}?select=${dateCol}&${dateCol}=gte.${since.toISOString()}&${dateCol}=lt.${until.toISOString()}&order=${dateCol}.desc&limit=1000`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      next: { revalidate: 600 },
    });
    if (!res.ok) return { ok: false, reason: "Supabase 조회 실패" };
    const rows = (await res.json()) as Record<string, unknown>[];
    return { ok: true, dates: rows.map((r) => Date.parse(String(r[dateCol] ?? ""))).filter((t) => !Number.isNaN(t)), truncated: rows.length >= 1000 };
  } catch {
    return { ok: false, reason: "Supabase 조회 실패(네트워크)" };
  }
}

export async function revenueDays(brand: BrandId, range: DateRange): Promise<RevenueDays> {
  const tokenEnv = POLAR_TOKEN_ENV[brand];
  const prefix = SUPABASE_PREFIX[brand];
  const { since, until } = rangeInstants({ from: range.prev.from, to: range.to });
  let times: number[];
  let source: "polar" | "supabase";
  let truncated = false;
  if (process.env[tokenEnv]) {
    const r = await polarPaid(tokenEnv, since, until);
    if (!r.ok) return r;
    times = r.paid.map((o) => Date.parse(o.created_at ?? "")).filter((t) => !Number.isNaN(t));
    source = "polar";
    truncated = r.truncated;
  } else if (hasSupabase(prefix)) {
    const r = await supabaseDates(prefix, since, until);
    if (!r.ok) return r;
    times = r.dates;
    source = "supabase";
    truncated = r.truncated;
  } else {
    return { ok: false, reason: "자격증명 없음" };
  }
  const by = new Map<string, number>();
  for (const t of times) by.set(localDate(t), (by.get(localDate(t)) ?? 0) + 1);
  // 1일 보기용 시간별 건수(같은 주문 시각에서 뽑는다).
  const byHour = new Map<string, CountHour>();
  for (const t of times) {
    const k = `${localDate(t)}|${localHour(t)}`;
    const c = byHour.get(k) ?? { date: localDate(t), hour: localHour(t), value: 0 };
    c.value += 1;
    byHour.set(k, c);
  }
  const hours = [...byHour.values()].sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
  return { ok: true, source, days: [...by.entries()].map(([date, orders]) => ({ date, orders })).sort((a, b) => a.date.localeCompare(b.date)), hours, truncated };
}
