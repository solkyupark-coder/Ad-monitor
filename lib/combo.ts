// '한눈에 보기' 겹쳐 그리는 일별 그래프의 데이터(순수 함수): 광고비(막대) + 실사용자·클릭(선) + 결제(마커), 직전 기간 같은 지표를 겹쳐 비교.
import { eachDay, type DateRange } from "@/lib/range";
import type { AdEvent } from "@/lib/events";
import type { AdHour, CountHour } from "@/lib/hourly";
import { fxRates, planCurrency } from "@/lib/fx";

export type ComboDay = { date: string; h?: number; spend: number | null; users: number | null; clicks: number | null; orders: number | null; signups: number | null };
export type CompareRow = { key: "spend" | "clicks" | "users" | "orders" | "signups"; label: string; cur: number; prev: number; won: boolean };
export type ComboCompare = { title: string; rows: CompareRow[] };
export type ComboData = {
  currency: string | null; // 광고비 통화(합칠 수 없으면 null)
  granularity: "day" | "hour"; // 1일 보기(어제·오늘)는 시간별
  nowHour: number | null; // 오늘 보기: 지금 시(그 뒤 칸은 비어 있다)
  usersLabel: string; // 사용자 선 이름(GA4 실사용자, 시간별을 못 읽으면 Vercel 방문자로 대체)
  days: ComboDay[]; // 조회 기간(시간별이면 0~23시 24칸)
  prev: ComboDay[]; // 직전 같은 길이 기간(같은 순서로 겹친다)
  events: AdEvent[];
  compare: ComboCompare | null; // 1일 보기: 전날 같은 시각까지와 견준 합계
  notes: string[];
};

type SpendDay = { date: string; spend: number; clicks: number };

export function buildCombo(x: {
  range: DateRange;
  meta: { currency: string; days: SpendDay[] } | null;
  ads: { currency: string; days: SpendDay[] } | null;
  users: { date: string; users: number }[] | null; // GA4 일별 실사용자(직전 기간부터)
  orders: { date: string; orders: number }[] | null; // 일별 결제 건수(직전 기간부터)
  signups?: { date: string; signups: number }[] | null; // 일별 신규 가입(직전 기간부터). 연결 안 됐으면 null
  events: AdEvent[];
}): ComboData {
  const { range } = x;
  const notes: string[] = [];
  const sides = [x.meta, x.ads].filter((s): s is NonNullable<typeof s> => !!s);
  // 지출이 0인 통화는 무시하고, 지출 있는 통화가 둘 이상이면 환율(고정·env)로 원화 환산해 합친다.
  const plan = planCurrency(sides.map((s) => ({ currency: s.currency, spend: s.days.reduce((a, d) => a + d.spend, 0) })), fxRates());
  const spendOk = sides.length > 0 && plan.currency !== null;
  if (sides.length > 1 && plan.currency === null) notes.push(`광고비 통화가 달라(${[...new Set(sides.map((s) => s.currency))].join(", ")}) 환율을 몰라 광고비 막대는 그리지 않습니다 — FX_RATES로 환율을 추가하세요.`);
  if (plan.note) notes.push(`광고비 막대는 ${plan.note}`);
  const mults = sides.map((s) => plan.mult(s.currency) ?? 0);
  const by = <T extends { date: string }>(rows: T[] | null) => new Map((rows ?? []).map((r) => [r.date, r]));
  const spendBy = sides.map((s) => by(s.days));
  const usersBy = by(x.users);
  const ordersBy = by(x.orders);
  const signupsBy = by(x.signups ?? null);
  const day = (date: string): ComboDay => ({
    date,
    spend: spendOk ? spendBy.reduce((a, m, i) => a + (m.get(date)?.spend ?? 0) * mults[i], 0) : null,
    clicks: sides.length ? spendBy.reduce((a, m) => a + (m.get(date)?.clicks ?? 0), 0) : null,
    users: x.users ? usersBy.get(date)?.users ?? 0 : null,
    orders: x.orders ? ordersBy.get(date)?.orders ?? 0 : null,
    signups: x.signups ? signupsBy.get(date)?.signups ?? 0 : null,
  });
  return {
    currency: spendOk ? plan.currency : null,
    granularity: "day",
    nowHour: null,
    usersLabel: "실사용자",
    days: eachDay(range.from, range.to).map(day),
    prev: eachDay(range.prev.from, range.prev.to).map(day),
    events: x.events,
    compare: null,
    notes,
  };
}

// ── 1일 보기(어제·오늘): 시간별 ────────────────────────────────
type HourSide = { currency: string; hours: AdHour[] | null; dayTotal: { spend: number; clicks: number } };

// 가능한 소스만 시간별로 그리고, 안 되는 소스는 하루 합계만 notes 로 알린다. 오늘이면 지금 시각 이후 칸은 비운다(어제 선은 하루 전체를 점선으로).
export function buildHourCombo(x: {
  range: DateRange;
  meta: HourSide | null;
  ads: HourSide | null;
  users: { rows: CountHour[]; label: string } | null; // GA4 시간별 실사용자, 없으면 Vercel 방문자
  usersDayTotal: number | null; // 시간별을 못 읽을 때 보여 줄 하루 합계(GA4 실사용자)
  orders: CountHour[] | null;
  ordersDayTotal: number | null;
  signups?: CountHour[] | null; // 시간별 신규 가입
  signupsDayTotal?: number | null;
}): ComboData {
  const { range } = x;
  const last = range.today && range.nowHour !== null ? range.nowHour : 23;
  const notes: string[] = [];
  const sides = [x.meta && { name: "메타", ...x.meta }, x.ads && { name: "구글 광고", ...x.ads }].filter((s): s is NonNullable<typeof s> => !!s);
  const hourly = sides.filter((s) => s.hours !== null);
  const plan = planCurrency(hourly.map((s) => ({ currency: s.currency, spend: (s.hours ?? []).reduce((a, h) => a + h.spend, 0) })), fxRates());
  const missing = sides.filter((s) => s.hours === null);
  // 광고 소스가 하나라도 시간별을 못 읽었으면 합계가 작아지므로 광고비·클릭 시간별은 그리지 않고 하루 합계만 알린다.
  const adsOk = hourly.length > 0 && missing.length === 0;
  const spendOk = adsOk && plan.currency !== null;
  const fmtMoney = (v: number, c: string) => (c === "KRW" ? `${Math.round(v).toLocaleString("ko-KR")}원` : `${v.toFixed(2)} ${c}`);
  for (const s of missing) notes.push(`${s.name} 시간별 데이터를 읽지 못해 시간별 광고비·클릭은 그리지 않습니다 — 하루 합계: 광고비 ${fmtMoney(s.dayTotal.spend, s.currency)} · 클릭 ${Math.round(s.dayTotal.clicks).toLocaleString("ko-KR")}번`);
  if (adsOk && hourly.length > 1 && plan.currency === null) notes.push(`광고비 통화가 달라(${[...new Set(hourly.map((s) => s.currency))].join(", ")}) 환율을 몰라 시간별 광고비 막대는 그리지 않습니다 — FX_RATES로 환율을 추가하세요.`);
  if (adsOk && plan.note) notes.push(`시간별 광고비 막대는 ${plan.note}`);
  const mults = hourly.map((s) => plan.mult(s.currency) ?? 0);
  if (!x.users && x.usersDayTotal !== null) notes.push(`GA4·Vercel 시간별 데이터가 없어 사용자 선은 숨깁니다 — 하루 합계 ${x.usersDayTotal.toLocaleString("ko-KR")}명`);
  if (!x.orders && x.ordersDayTotal !== null) notes.push(`결제 시간별 데이터가 없어 마커는 숨깁니다 — 하루 합계 ${x.ordersDayTotal}건`);
  if (!x.signups && x.signupsDayTotal != null) notes.push(`가입 시간별 데이터가 없어 마커는 숨깁니다 — 하루 합계 ${x.signupsDayTotal}명`);

  const idx = (rows: { date: string; hour: number }[] | null) => new Map((rows ?? []).map((r) => [`${r.date}|${r.hour}`, r]));
  const adBy = hourly.map((s) => ({ s, m: idx(s.hours) as Map<string, AdHour> }));
  const usersBy = idx(x.users?.rows ?? null) as Map<string, CountHour>;
  const ordersBy = idx(x.orders) as Map<string, CountHour>;
  const signupsBy = idx(x.signups ?? null) as Map<string, CountHour>;
  const point = (date: string, h: number, live: boolean): ComboDay => ({
    date,
    h,
    spend: live && spendOk ? adBy.reduce((a, { m }, i) => a + (m.get(`${date}|${h}`)?.spend ?? 0) * mults[i], 0) : null,
    clicks: live && adsOk ? adBy.reduce((a, { m }) => a + (m.get(`${date}|${h}`)?.clicks ?? 0), 0) : null,
    users: live && x.users ? usersBy.get(`${date}|${h}`)?.value ?? 0 : null,
    orders: live && x.orders ? ordersBy.get(`${date}|${h}`)?.value ?? 0 : null,
    signups: live && x.signups ? signupsBy.get(`${date}|${h}`)?.value ?? 0 : null,
  });
  const hoursOf = (date: string, upTo: number) => Array.from({ length: 24 }, (_, h) => point(date, h, h <= upTo));
  const days = hoursOf(range.to, last);
  const prev = hoursOf(range.prev.to, 23);

  // 합계 비교: 오늘이면 어제 같은 시각까지, 어제면 하루 전체끼리.
  const sum = (src: ComboDay[], k: "spend" | "clicks" | "users" | "orders" | "signups", upTo: number) => src.filter((d) => (d.h ?? 0) <= upTo).reduce((a, d) => a + (d[k] ?? 0), 0);
  const has = (k: "spend" | "clicks" | "users" | "orders" | "signups") => days.some((d) => d[k] !== null);
  const defs: { key: CompareRow["key"]; label: string; won: boolean }[] = [
    { key: "spend", label: "광고비", won: true },
    { key: "clicks", label: "광고 클릭", won: false },
    { key: "users", label: `${x.users?.label ?? "실사용자"}(시간별 합)`, won: false },
    { key: "orders", label: "결제", won: false },
    { key: "signups", label: "가입", won: false },
  ];
  const rows = defs.filter((d) => has(d.key)).map((d) => ({ ...d, cur: sum(days, d.key, last), prev: sum(prev, d.key, last) }));
  return {
    currency: spendOk ? plan.currency : null,
    granularity: "hour",
    nowHour: range.today ? range.nowHour : null,
    usersLabel: x.users?.label ?? "실사용자",
    days,
    prev,
    events: [],
    compare: rows.length ? { title: range.today ? `오늘 0~${last}시 vs 어제 같은 시각까지(0~${last}시)` : "어제 하루 vs 그제 하루", rows } : null,
    notes,
  };
}
