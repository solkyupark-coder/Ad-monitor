// '이번 주 한눈에' 퍼널 계산(순수 함수). 광고 노출 → 광고 클릭 → 사이트 실사용자(봇 제외) → 실제 결제.
type Day = { impressions: number; clicks: number };
type SpendDay = Day & { spend?: number; cost?: number };

export type FunnelStep = { key: string; label: string; note: string; value: number | null; rateFromPrev: number | null };
export type Overview = {
  spend: number | null;
  currency: string;
  spendNote: string;
  steps: FunnelStep[];
  costPerUser: number | null;
  costPerOrder: number | null;
};

const last7 = <T,>(days: T[]) => days.slice(-7);
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

export function buildOverview(input: {
  meta: { days: SpendDay[]; currency: string } | null;
  ads: { days: SpendDay[]; currency: string } | null;
  realUsers: number | null; // GA4 봇 제외 7일 활성 사용자
  orders: number | null; // 실제 결제 건수(7일)
}): Overview {
  const sources = [
    input.meta && { name: "메타", days: last7(input.meta.days), currency: input.meta.currency, spend: (d: SpendDay) => d.spend ?? 0 },
    input.ads && { name: "구글 광고", days: last7(input.ads.days), currency: input.ads.currency, spend: (d: SpendDay) => d.cost ?? 0 },
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));

  const currencies = [...new Set(sources.map((s) => s.currency))];
  const spend = sources.length && currencies.length === 1 ? sum(sources, (s) => sum(s.days, s.spend)) : null;
  const spendNote = !sources.length
    ? "광고 연결 없음"
    : currencies.length > 1
      ? `통화가 달라 합산하지 않음 (${currencies.join(", ")})`
      : sources.map((s) => s.name).join(" + ");

  const impressions = sources.length ? sum(sources, (s) => sum(s.days, (d) => d.impressions)) : null;
  const clicks = sources.length ? sum(sources, (s) => sum(s.days, (d) => d.clicks)) : null;
  const raw: Omit<FunnelStep, "rateFromPrev">[] = [
    { key: "impressions", label: "광고 노출", note: spendNote, value: impressions },
    { key: "clicks", label: "광고 클릭", note: spendNote, value: clicks },
    { key: "users", label: "사이트 실사용자", note: "GA4 · 봇 의심 제외 · 광고 외 유입 포함", value: input.realUsers },
    { key: "orders", label: "실제 결제", note: "Polar / Supabase 결제 완료", value: input.orders },
  ];
  const steps = raw.map((s, i) => {
    const prev = raw[i - 1]?.value;
    return { ...s, rateFromPrev: i > 0 && prev && s.value !== null ? s.value / prev : null };
  });
  return {
    spend,
    currency: currencies[0] ?? "KRW",
    spendNote,
    steps,
    costPerUser: spend !== null && input.realUsers ? spend / input.realUsers : null,
    costPerOrder: spend !== null && input.orders ? spend / input.orders : null,
  };
}

// 단계 간 차이가 수백 배라 막대 길이는 로그 눈금으로 그린다(값은 숫자로 따로 표시).
export function logWidth(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(2, (Math.log10(value + 1) / Math.log10(max + 1)) * 100);
}
