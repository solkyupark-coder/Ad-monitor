// 엣시 샵 읽기 전용 조회(Open API v3): 샵 현황(누적)과 기간별 주문·판매액·국가·많이 팔린 상품.
// 엣시 API에는 샵 방문·조회 통계가 없다 — 방문 수는 엣시 앱/Shop Manager에서만 볼 수 있다.
// 자격증명/토큰 값은 화면·로그에 내지 않는다.
import { etsyApiKey, etsyToken } from "@/lib/etsy-oauth";
import { logFailure } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { eachDay, offsetMs, type DateRange } from "@/lib/range";

const API = "https://api.etsy.com/v3/application";
const DAY = 86400000;
const MAX_RECEIPTS = 500; // 기간당 최대 5페이지(100건씩)

type Money = { amount: number; divisor: number; currency_code: string };
type Receipt = {
  receipt_id: number;
  create_timestamp?: number;
  created_timestamp?: number;
  status?: string;
  is_paid?: boolean;
  country_iso?: string | null;
  grandtotal?: Money;
  transactions?: { listing_id?: number; title?: string; quantity?: number }[];
};
type Shop = {
  shop_id: number;
  shop_name: string;
  url?: string;
  currency_code?: string;
  num_favorers?: number;
  listing_active_count?: number;
  transaction_sold_count?: number;
  review_count?: number | null;
  review_average?: number | null;
};
type Listing = { listing_id: number; title: string; views?: number; num_favorers?: number; url?: string };

export type EtsyPeriod = { orders: number; amount: number; canceled: number };
export type EtsyDay = { date: string; orders: number; amount: number };
export type EtsySummary =
  | {
      ok: true;
      shopName: string;
      shopUrl: string | null;
      currency: string;
      favorers: number | null; // 샵 즐겨찾기(누적)
      activeListings: number | null;
      soldTotal: number | null; // 누적 판매 수량
      reviews: { count: number; average: number | null } | null;
      cur: EtsyPeriod;
      prev: EtsyPeriod | null;
      days: EtsyDay[];
      countries: { country: string; orders: number }[];
      topItems: { title: string; quantity: number }[];
      listings: { title: string; views: number | null; favorers: number | null; url: string | null }[]; // 누적 조회 많은 순
      truncated: boolean;
    }
  | { ok: false; reason: string; reconnect: boolean };

const prefixOf = (brand: BrandId) => BRANDS.find((b) => b.id === brand)!.prefix;

async function get<T>(path: string, params: Record<string, string>, token: string, key: string): Promise<{ ok: true; v: T } | { ok: false; status: number; error: string }> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    headers: { authorization: `Bearer ${token}`, "x-api-key": key },
    next: { revalidate: 600 }, // 하루 호출 한도 절약: 10분 캐시
  });
  if (res.ok) return { ok: true, v: (await res.json()) as T };
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, status: res.status, error: j.error ?? `http_${res.status}` };
}

const money = (m: Money | undefined) => (m && m.divisor ? m.amount / m.divisor : 0);
const created = (r: Receipt) => r.create_timestamp ?? r.created_timestamp ?? 0;
const dateOf = (sec: number) => new Date(sec * 1000 + offsetMs()).toISOString().slice(0, 10);
// 날짜 경계 시간대 기준 하루의 시작(UTC 초).
const startSec = (date: string) => Math.floor((Date.parse(`${date}T00:00:00Z`) - offsetMs()) / 1000);
const isCanceled = (r: Receipt) => r.status === "canceled" || r.status === "fully refunded";

async function receipts(shopId: number, from: string, to: string, token: string, key: string) {
  const out: Receipt[] = [];
  const min = startSec(from);
  const max = Math.min(startSec(to) + DAY / 1000 - 1, Math.floor(Date.now() / 1000));
  for (let offset = 0; offset < MAX_RECEIPTS; offset += 100) {
    const r = await get<{ count: number; results: Receipt[] }>(
      `/shops/${shopId}/receipts`,
      { min_created: String(min), max_created: String(max), limit: "100", offset: String(offset), sort_on: "created", sort_order: "asc" },
      token,
      key,
    );
    if (!r.ok) return r;
    out.push(...r.v.results);
    if (r.v.results.length < 100 || out.length >= r.v.count) return { ok: true as const, v: out, truncated: false };
  }
  return { ok: true as const, v: out, truncated: true };
}

function period(rows: Receipt[]): EtsyPeriod {
  const live = rows.filter((r) => !isCanceled(r));
  return { orders: live.length, amount: live.reduce((a, r) => a + money(r.grandtotal), 0), canceled: rows.length - live.length };
}

function failure(status: number, error: string): { ok: false; reason: string; reconnect: boolean } {
  if (status === 401 || error === "invalid_token") return { ok: false, reason: "엣시 접근 권한이 없습니다 — 토큰이 만료됐거나 취소됐습니다. '엣시 다시 연결'로 새 refresh token을 받으세요", reconnect: true };
  if (status === 403) return { ok: false, reason: `엣시가 요청을 막았습니다 (${error}) — 앱 키(ETSY_KEYSTRING·ETSY_SHARED_SECRET)와 앱 승인 상태를 확인하세요`, reconnect: false };
  if (status === 429) return { ok: false, reason: "엣시 호출 한도를 넘었습니다 — 잠시 뒤 다시 보세요", reconnect: false };
  return { ok: false, reason: `엣시 조회 실패 (${error})`, reconnect: false };
}

export async function etsySummary(brand: BrandId, range: DateRange): Promise<EtsySummary> {
  const envName = `${prefixOf(brand)}_ETSY_REFRESH_TOKEN`;
  const refresh = process.env[envName];
  const key = etsyApiKey();
  if (!refresh || !key) return { ok: false, reason: "엣시 자격증명이 없습니다", reconnect: !refresh };
  const t = await etsyToken(refresh);
  if (!t.ok) {
    logFailure("etsy", brand, `token ${t.error}`);
    return t.error === "invalid_grant"
      ? { ok: false, reason: `엣시 refresh token이 만료됐거나 취소됐습니다(발급 후 90일) — '엣시 다시 연결'로 새로 받아 ${envName}에 넣으세요`, reconnect: true }
      : { ok: false, reason: `엣시 토큰 갱신 실패 (${t.error}) — ETSY_KEYSTRING이 연결할 때 쓴 앱과 같은지 확인하세요`, reconnect: false };
  }
  const me = await get<{ user_id: number; shop_id?: number | null }>("/users/me", {}, t.token, key);
  if (!me.ok) return failure(me.status, me.error);
  if (!me.v.shop_id) return { ok: false, reason: "연결한 엣시 계정에 샵이 없습니다 — 샵 주인 계정으로 다시 연결하세요", reconnect: true };
  const shopId = me.v.shop_id;
  const [shop, cur, prev, listings] = await Promise.all([
    get<Shop>(`/shops/${shopId}`, {}, t.token, key),
    receipts(shopId, range.from, range.to, t.token, key),
    range.today ? null : receipts(shopId, range.prev.from, range.prev.to, t.token, key),
    get<{ results: Listing[] }>(`/shops/${shopId}/listings/active`, { limit: "100" }, t.token, key),
  ]);
  if (!shop.ok) return failure(shop.status, shop.error);
  if (!cur.ok) {
    logFailure("etsy", brand, `receipts ${cur.status} ${cur.error}`);
    return failure(cur.status, cur.error);
  }
  const live = cur.v.filter((r) => !isCanceled(r));
  const byDay = new Map<string, EtsyDay>(eachDay(range.from, range.to).map((d) => [d, { date: d, orders: 0, amount: 0 }]));
  const countries = new Map<string, number>();
  const items = new Map<string, number>();
  for (const r of live) {
    const d = byDay.get(dateOf(created(r)));
    if (d) {
      d.orders += 1;
      d.amount += money(r.grandtotal);
    }
    const c = r.country_iso || "알 수 없음";
    countries.set(c, (countries.get(c) ?? 0) + 1);
    for (const tx of r.transactions ?? []) {
      const title = tx.title ?? `상품 ${tx.listing_id ?? ""}`;
      items.set(title, (items.get(title) ?? 0) + (tx.quantity ?? 1));
    }
  }
  const s = shop.v;
  const ls = listings.ok ? listings.v.results : [];
  return {
    ok: true,
    shopName: s.shop_name,
    shopUrl: s.url ?? null,
    currency: live.find((r) => r.grandtotal)?.grandtotal?.currency_code ?? s.currency_code ?? "USD",
    favorers: s.num_favorers ?? null,
    activeListings: s.listing_active_count ?? null,
    soldTotal: s.transaction_sold_count ?? null,
    reviews: s.review_count ? { count: s.review_count, average: s.review_average ?? null } : null,
    cur: period(cur.v),
    prev: prev && prev.ok ? period(prev.v) : null,
    days: [...byDay.values()],
    countries: [...countries].map(([country, orders]) => ({ country, orders })).sort((a, b) => b.orders - a.orders),
    topItems: [...items].map(([title, quantity]) => ({ title, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    listings: ls
      .map((l) => ({ title: l.title, views: typeof l.views === "number" ? l.views : null, favorers: l.num_favorers ?? null, url: l.url ?? null }))
      .sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || (b.favorers ?? 0) - (a.favorers ?? 0))
      .slice(0, 10),
    truncated: cur.truncated,
  };
}
