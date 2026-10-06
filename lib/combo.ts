// '한눈에 보기' 겹쳐 그리는 일별 그래프의 데이터(순수 함수): 광고비(막대) + 실사용자·클릭(선) + 결제(마커), 직전 기간 같은 지표를 겹쳐 비교.
import { eachDay, type DateRange } from "@/lib/range";
import type { AdEvent } from "@/lib/events";

export type ComboDay = { date: string; spend: number | null; users: number | null; clicks: number | null; orders: number | null };
export type ComboData = {
  currency: string | null; // 광고비 통화(합칠 수 없으면 null)
  days: ComboDay[]; // 조회 기간
  prev: ComboDay[]; // 직전 같은 길이 기간(같은 순서로 겹친다)
  events: AdEvent[];
  notes: string[];
};

type SpendDay = { date: string; spend: number; clicks: number };

export function buildCombo(x: {
  range: DateRange;
  meta: { currency: string; days: SpendDay[] } | null;
  ads: { currency: string; days: SpendDay[] } | null;
  users: { date: string; users: number }[] | null; // GA4 일별 실사용자(직전 기간부터)
  orders: { date: string; orders: number }[] | null; // 일별 결제 건수(직전 기간부터)
  events: AdEvent[];
}): ComboData {
  const { range } = x;
  const notes: string[] = [];
  const sides = [x.meta, x.ads].filter((s): s is NonNullable<typeof s> => !!s);
  const currencies = [...new Set(sides.map((s) => s.currency))];
  const spendOk = sides.length > 0 && currencies.length === 1;
  if (currencies.length > 1) notes.push(`광고비 통화가 달라(${currencies.join(", ")}) 광고비 막대는 그리지 않습니다.`);
  const by = <T extends { date: string }>(rows: T[] | null) => new Map((rows ?? []).map((r) => [r.date, r]));
  const spendBy = sides.map((s) => by(s.days));
  const usersBy = by(x.users);
  const ordersBy = by(x.orders);
  const day = (date: string): ComboDay => ({
    date,
    spend: spendOk ? spendBy.reduce((a, m) => a + (m.get(date)?.spend ?? 0), 0) : null,
    clicks: sides.length ? spendBy.reduce((a, m) => a + (m.get(date)?.clicks ?? 0), 0) : null,
    users: x.users ? usersBy.get(date)?.users ?? 0 : null,
    orders: x.orders ? ordersBy.get(date)?.orders ?? 0 : null,
  });
  return {
    currency: spendOk ? currencies[0] : null,
    days: eachDay(range.from, range.to).map(day),
    prev: eachDay(range.prev.from, range.prev.to).map(day),
    events: x.events,
    notes,
  };
}
