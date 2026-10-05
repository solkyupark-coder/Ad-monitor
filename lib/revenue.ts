// 실제 결제 기준 매출(읽기 전용). 하우스케이퍼: Polar 주문, 토포제네시스: Supabase purchase 테이블.
// 토큰·키 값은 화면·로그에 내지 않는다.
import type { BrandId } from "@/lib/platforms";

export type RevenueSummary =
  | { ok: true; source: "polar" | "supabase"; currency: string; orders: number; amount: number | null; truncated: boolean }
  | { ok: false; reason: string };

const DAY = 86400000;
const ZERO_DECIMAL = new Set(["KRW", "JPY", "VND", "CLP", "ISK", "UGX", "XAF", "XOF"]);

// GA 'yesterday' 기준과 맞추기 위해 [오늘 0시-7일, 오늘 0시) 구간을 쓴다. 날짜 경계는 DASHBOARD_UTC_OFFSET_HOURS(기본 9).
export function revenueWindow(now = Date.now(), offsetHours = Number(process.env.DASHBOARD_UTC_OFFSET_HOURS ?? 9)) {
  const off = (Number.isFinite(offsetHours) ? offsetHours : 9) * 3600000;
  const today = Math.floor((now + off) / DAY) * DAY - off;
  return { since: new Date(today - 7 * DAY), until: new Date(today) };
}

type PolarOrder = { created_at?: string; status?: string; paid?: boolean; net_amount?: number; total_amount?: number; currency?: string };

async function polar(): Promise<RevenueSummary> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: "자격증명 없음" };
  const { since, until } = revenueWindow();
  const mine: PolarOrder[] = [];
  let truncated = false;
  try {
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(`https://api.polar.sh/v1/orders/?limit=100&page=${page}&sorting=-created_at`, {
        headers: { authorization: `Bearer ${token}` },
        next: { revalidate: 600 },
      });
      if (res.status === 401 || res.status === 403) return { ok: false, reason: "Polar 토큰 거절 — 읽기 전용 토큰과 권한(orders:read)을 확인하세요" };
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
      if (page === 10) truncated = true;
    }
  } catch {
    return { ok: false, reason: "Polar 조회 실패(네트워크)" };
  }
  // 결제 완료된 주문만. paid 필드가 없으면 status 로 판단한다.
  const paid = mine.filter((o) => o.paid ?? o.status === "paid");
  const currency = (paid[0]?.currency ?? "usd").toUpperCase();
  const minor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  const amount = paid.filter((o) => (o.currency ?? "usd").toUpperCase() === currency).reduce((a, o) => a + (o.net_amount ?? o.total_amount ?? 0), 0) / minor;
  return { ok: true, source: "polar", currency, orders: paid.length, amount, truncated };
}

async function supabasePurchases(prefix: string): Promise<RevenueSummary> {
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
  const { since, until } = revenueWindow();
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

export async function revenueSummary(brand: BrandId): Promise<RevenueSummary> {
  return brand === "houscaper" ? polar() : supabasePurchases("TOPOGENESIS");
}
