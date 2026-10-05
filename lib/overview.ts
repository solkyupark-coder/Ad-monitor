// '한눈에' 퍼널 계산(순수 함수). 광고 노출 → 광고 클릭 → 사이트 실사용자(봇 제외) → 실제 결제.
type Day = { impressions: number; clicks: number };
type SpendDay = Day & { spend?: number; cost?: number };

export type Level = "good" | "warn" | "bad" | "info";
export type Meaning = { level: Level; rateName: string; text: string };
export type FunnelStep = { key: string; label: string; note: string; value: number | null; rateFromPrev: number | null; meaning: Meaning | null };
export type Verdict = { level: Level; headline: string; detail: string; action: string };
export type Overview = {
  verdict: Verdict | null;
  spend: number | null;
  currency: string;
  spendNote: string;
  steps: FunnelStep[];
  costPerUser: number | null;
  costPerOrder: number | null;
};

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

export function buildOverview(input: {
  meta: { days: SpendDay[]; currency: string } | null;
  ads: { days: SpendDay[]; currency: string } | null;
  realUsers: number | null; // GA4 봇 제외 조회 기간 활성 사용자
  botUsers?: number | null; // GA4 봇 의심으로 뺀 사용자
  orders: number | null; // 조회 기간 실제 결제 건수
  days: number; // 조회 기간 일수(광고 일별 행의 마지막 N일을 쓴다)
}): Overview {
  const lastN = <T,>(days: T[]) => days.slice(-input.days);
  const sources = [
    input.meta && { name: "메타", days: lastN(input.meta.days), currency: input.meta.currency, spend: (d: SpendDay) => d.spend ?? 0 },
    input.ads && { name: "구글 광고", days: lastN(input.ads.days), currency: input.ads.currency, spend: (d: SpendDay) => d.cost ?? 0 },
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
  const raw: Omit<FunnelStep, "rateFromPrev" | "meaning">[] = [
    { key: "impressions", label: "광고 노출", note: spendNote, value: impressions },
    { key: "clicks", label: "광고 클릭", note: spendNote, value: clicks },
    { key: "users", label: "사이트 실사용자", note: "GA4 · 봇 의심 제외 · 광고 외 유입 포함", value: input.realUsers },
    { key: "orders", label: "실제 결제", note: "Polar / Supabase 결제 완료", value: input.orders },
  ];
  const steps = raw.map((s, i) => {
    const prev = raw[i - 1]?.value;
    const rateFromPrev = i > 0 && prev && s.value !== null ? s.value / prev : null;
    return { ...s, rateFromPrev, meaning: meaningFor(s.key, rateFromPrev, s.value, prev ?? null) };
  });
  return {
    verdict: verdictFor({ impressions, clicks, users: input.realUsers, orders: input.orders, bots: input.botUsers ?? null, spend, currency: currencies[0] ?? "KRW" }),
    spend,
    currency: currencies[0] ?? "KRW",
    spendNote,
    steps,
    costPerUser: spend !== null && input.realUsers ? spend / input.realUsers : null,
    costPerOrder: spend !== null && input.orders ? spend / input.orders : null,
  };
}

// ── 해석 ─────────────────────────────────────────────
// 기준값은 업계 평균의 대략치다(메타 링크 CTR 약 1%, 소규모 온라인몰 방문→구매 1~3%). 판단이 아니라 '어디부터 볼지'를 알려 주는 용도.
const CTR_LOW = 0.005;
const CTR_HIGH = 0.025;
const ARRIVE_LOW = 0.3; // 광고 클릭 대비 사이트 실사용자
const CVR_LOW = 0.01;
const MIN_USERS_FOR_CVR = 100; // 이보다 적으면 결제 0건도 우연일 수 있다
const p1 = (r: number) => `${(r * 100).toFixed(r < 0.01 ? 2 : 1)}%`;

function meaningFor(key: string, rate: number | null, value: number | null, prev: number | null): Meaning | null {
  if (key === "clicks" && rate !== null) {
    if (rate > CTR_HIGH) return { level: "warn", rateName: "클릭률", text: `보통(약 1%)보다 훨씬 높음. 좋은 신호가 아니라 앱 속 배너·실수 클릭일 때 이렇게 나온다 — 다음 단계(사이트 도착)와 같이 봐야 한다.` };
    if (rate < CTR_LOW) return { level: "warn", rateName: "클릭률", text: "낮음. 광고가 눈길을 못 끈다 — 소재(첫 화면)나 타깃을 바꿔 볼 단계." };
    return { level: "good", rateName: "클릭률", text: "보통 범위(약 1%)." };
  }
  if (key === "users" && rate !== null) {
    if (rate > 1) return { level: "info", rateName: "클릭 대비 방문", text: "광고 클릭보다 실사용자가 많다 — 검색·직접 방문 등 광고 밖 유입이 더 크다." };
    if (rate < ARRIVE_LOW) return { level: "bad", rateName: "클릭 대비 방문", text: `클릭 ${prev?.toLocaleString("ko-KR")}번 중 사람으로 보이는 방문은 ${value?.toLocaleString("ko-KR")}명. 클릭 대부분이 사이트에 안 닿거나 봇이다.` };
    return { level: "good", rateName: "클릭 대비 방문", text: "클릭한 사람이 사이트까지 잘 온다." };
  }
  if (key === "orders" && value !== null) {
    const users = prev ?? 0;
    if (value === 0 && users < MIN_USERS_FOR_CVR) return { level: "warn", rateName: "방문 대비 결제", text: `방문 ${users}명으로는 결제 0건이 이상하지 않다(보통 100명 중 1~3명). 결제보다 진짜 방문을 먼저 늘려야 한다.` };
    if (value === 0) return { level: "bad", rateName: "방문 대비 결제", text: `사람 ${users.toLocaleString("ko-KR")}명이 왔는데 결제 0건. 보통이면 ${Math.round(users * 0.01)}~${Math.round(users * 0.03)}건 — 상품·가격·결제 화면을 봐야 한다.` };
    if (rate !== null && rate < CVR_LOW) return { level: "warn", rateName: "방문 대비 결제", text: `${p1(rate)} — 보통(1~3%)보다 낮다.` };
    return { level: "good", rateName: "방문 대비 결제", text: "보통 이상." };
  }
  return null;
}

function verdictFor(x: { impressions: number | null; clicks: number | null; users: number | null; orders: number | null; bots: number | null; spend: number | null; currency: string }): Verdict | null {
  const { impressions, clicks, users, orders, bots } = x;
  const k = (v: number) => v.toLocaleString("ko-KR");
  const won = (v: number) => (x.currency === "KRW" ? `${k(Math.round(v))}원` : `${v.toFixed(2)} ${x.currency}`);
  if (users !== null && bots && bots > users) {
    const share = bots / (bots + users);
    return {
      level: "bad",
      headline: `사이트 방문의 ${Math.round(share * 100)}%가 봇 의심`,
      detail: `GA4에 찍힌 사용자 ${k(bots + users)}명 중 실제 사람으로 보이는 건 ${k(users)}명뿐이다. 광고비가 사람이 아닌 트래픽에 쓰이고 있을 가능성이 크다.`,
      action: "메타는 오디언스 네트워크 지면을, 구글은 검색 파트너·디스플레이 확장을 끄고 국가를 판매 국가로 좁힌다.",
    };
  }
  if (clicks && users !== null && users / clicks < ARRIVE_LOW) {
    const ctr = impressions ? clicks / impressions : null;
    return {
      level: "bad",
      headline: "광고 클릭이 사람 방문으로 이어지지 않음",
      detail: `클릭 ${k(clicks)}번에 실사용자 ${k(users)}명(${p1(users / clicks)}).${ctr !== null && ctr > CTR_HIGH ? ` 클릭률 ${p1(ctr)}도 비정상적으로 높아 실수·봇 클릭일 가능성이 크다.` : " 페이지가 느리거나 클릭 직후 이탈한다."}`,
      action: "지면을 피드·릴스로 한정하고, 최적화 목표를 '링크 클릭'이 아닌 '랜딩 페이지 조회'나 '리드'로 바꾼다.",
    };
  }
  if (orders === 0 && users !== null && users >= MIN_USERS_FOR_CVR) {
    return {
      level: "bad",
      headline: "사람은 오는데 결제가 없음",
      detail: `실사용자 ${k(users)}명, 결제 0건. 트래픽 문제가 아니라 사이트 안(상품·가격·결제 흐름) 문제다.`,
      action: "결제 버튼까지 가는 비율을 GA4 이벤트로 확인하고, 무료 체험→결제 유도 문구를 점검한다.",
    };
  }
  if (orders === 0 && users !== null) {
    return {
      level: "warn",
      headline: "결제를 판단하기엔 방문이 너무 적음",
      detail: `실사용자 ${k(users)}명. 보통 100명 중 1~3명이 결제하니, 지금 결제 0건은 사이트 탓이라고 보기 어렵다.`,
      action: "광고비를 늘리기 전에 사람이 실제로 오는 지면·국가로 좁혀 '실사용자 1명당 광고비'부터 낮춘다.",
    };
  }
  if (orders && x.spend !== null) {
    return {
      level: "good",
      headline: "광고부터 결제까지 흐름이 이어지고 있음",
      detail: `결제 ${k(orders)}건, 1건당 광고비 ${won(x.spend / orders)}. 이 값이 상품 마진보다 낮으면 남는 광고다.`,
      action: "결제 1건당 광고비를 기간별로 비교해 오르는 캠페인부터 줄인다.",
    };
  }
  return null;
}

// 단계 간 차이가 수백 배라 막대 길이는 로그 눈금으로 그린다(값은 숫자로 따로 표시).
export function logWidth(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(2, (Math.log10(value + 1) / Math.log10(max + 1)) * 100);
}
