// '한눈에' 퍼널 계산(순수 함수). 광고 노출 → 광고 클릭 → 사이트 실사용자(봇 제외) → 실제 결제.
import { fxRates, planCurrency } from "@/lib/fx";
type Day = { date?: string; impressions: number; clicks: number };
type SpendDay = Day & { spend?: number; cost?: number };

export type Level = "good" | "warn" | "bad" | "info";
export type Meaning = { level: Level; rateName: string; text: string };
export type FunnelStep = { key: string; label: string; note: string; value: number | null; rateFromPrev: number | null; meaning: Meaning | null };
export type Verdict = { level: Level; headline: string; detail: string; action: string; adSide?: boolean }; // adSide: 행동 제안이 광고 설정(지면·예산)에 관한 것 — 광고가 이미 다 꺼져 있으면 과거 기록으로 낮춘다
export type DailyPoint = { date: string; spend: number | null; clicks: number; impressions: number };
export type ChannelSpend = { name: string; spend: number };
export type Overview = {
  verdict: Verdict | null;
  spendPrev: number | null; // 직전 같은 길이 기간 광고비(비교용). 일별 데이터가 모자라면 null
  channels: ChannelSpend[]; // 채널별 광고비(통화가 하나일 때만 의미 있음)
  daily: DailyPoint[]; // 조회 기간 일별 합계(두 광고 채널 합산)
  spend: number | null;
  currency: string;
  spendNote: string;
  fxNote: string | null; // 통화가 섞여 원화로 환산했을 때: 원통화 + 환율 설명
  steps: FunnelStep[];
  costPerUser: number | null;
  costPerOrder: number | null;
  signups: number | null; // 신규 가입(연결 안 됐으면 null)
  signupsPrev: number | null; // 직전 같은 길이 기간 가입(오늘 보기·못 읽으면 null)
  costPerSignup: number | null;
  primary: "signups" | "orders"; // 이 브랜드의 핵심 전환 — 화면 KPI 순서·판정이 이걸 따른다
};

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

export function buildOverview(input: {
  meta: { days: SpendDay[]; currency: string } | null;
  ads: { days: SpendDay[]; currency: string } | null;
  realUsers: number | null; // GA4 봇 제외 조회 기간 활성 사용자
  botUsers?: number | null; // GA4 봇 의심으로 뺀 사용자
  suspect?: SuspectContext | null; // 봇 의심의 출처를 말하기 위한 근거(데이터센터 비중·유료 소스별 참여·메타 노출 위치)
  internalUsers?: number | null; // 본인(운영자) 접속으로 뺀 사용자(도시 기준). 0·null 이면 표시 안 함
  orders: number | null; // 조회 기간 실제 결제 건수
  days: number; // 조회 기간 일수(광고 일별 행의 마지막 N일을 쓴다)
  today?: boolean; // 오늘 보기(하루가 안 끝남): 어제 전체와 견주지 않는다
  signups?: number | null; // 신규 가입(Supabase, 개수만). 연결 안 됐으면 null
  signupsPrev?: number | null;
  primary?: "signups" | "orders"; // 핵심 전환(기본 orders)
}): Overview {
  const lastN = <T,>(days: T[]) => days.slice(-input.days);
  const sources = [
    input.meta && { name: "메타", all: input.meta.days, days: lastN(input.meta.days), currency: input.meta.currency, spend: (d: SpendDay) => d.spend ?? 0 },
    input.ads && { name: "구글 광고", all: input.ads.days, days: lastN(input.ads.days), currency: input.ads.currency, spend: (d: SpendDay) => d.cost ?? 0 },
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));

  // 지출이 0인 통화는 무시한다. 지출 있는 통화가 둘 이상이면(예: 메타 USD + 구글 KRW) 환율(고정·env)로 원화 환산해 합친다.
  const plan = planCurrency(sources.map((s) => ({ currency: s.currency, spend: sum(s.days, s.spend) })), fxRates());
  const convertible = plan.currency !== null && sources.every((s) => plan.mult(s.currency) !== null || sum(s.days, s.spend) === 0);
  const m = (cur: string) => plan.mult(cur) ?? 0;
  const spend = sources.length && convertible ? sum(sources, (s) => sum(s.days, s.spend) * m(s.currency)) : null;
  const spendNote = !sources.length
    ? "광고 연결 없음"
    : !convertible
      ? `통화가 달라 합산하지 않음 (${[...new Set(sources.map((s) => s.currency))].join(", ")}) — 환율을 모르는 통화가 있습니다(FX_RATES로 추가)`
      : sources.map((s) => s.name).join(" + ");

  // 직전 같은 길이 기간(모든 광고 채널에 일별 행이 그만큼 있을 때만).
  const prevOf = (days: SpendDay[]) => days.slice(-2 * input.days, -input.days);
  const prevOk = sources.every((s) => plan.mult(s.currency) !== null || sum(prevOf(s.all), s.spend) === 0);
  const spendPrev =
    !input.today && spend !== null && prevOk && sources.every((s) => prevOf(s.all).length === input.days) ? sum(sources, (s) => sum(prevOf(s.all), s.spend) * m(s.currency)) : null;
  const impressions = sources.length ? sum(sources, (s) => sum(s.days, (d) => d.impressions)) : null;
  const clicks = sources.length ? sum(sources, (s) => sum(s.days, (d) => d.clicks)) : null;
  const raw: Omit<FunnelStep, "rateFromPrev" | "meaning">[] = [
    { key: "impressions", label: "광고 노출", note: spendNote, value: impressions },
    { key: "clicks", label: "광고 클릭", note: spendNote, value: clicks },
    { key: "users", label: "사이트 실사용자", note: `GA4 · 봇 의심 제외${input.internalUsers ? ` · 본인 제외 ${input.internalUsers.toLocaleString("ko-KR")}명` : ""} · 광고 외 유입 포함`, value: input.realUsers },
    ...(input.signups != null ? [{ key: "signups", label: "신규 가입", note: "Supabase 가입 수(개수만)", value: input.signups }] : []),
    { key: "orders", label: "실제 결제", note: "Polar / Supabase 결제 완료", value: input.orders },
  ];
  // 1일 보기는 표본이 작아 '낭비·봇·결제 0건' 같은 단정을 하지 않는다: 단계 해석은 참고(info)로 낮춘다.
  const tone = (m: Meaning | null): Meaning | null => (m && input.days <= 1 && (m.level === "bad" || m.level === "warn") ? { ...m, level: "info", text: `표본이 작아 참고만: ${m.text}` } : m);
  const steps = raw.map((s, i) => {
    // 가입·결제는 둘 다 '사이트 실사용자' 대비로 본다(가입 → 결제 순서로 늘어놓아도 결제율이 가입 대비로 바뀌지 않게).
    const prev = (s.key === "signups" || s.key === "orders" ? raw.find((x) => x.key === "users") : raw[i - 1])?.value;
    const rateFromPrev = i > 0 && prev && s.value !== null ? s.value / prev : null;
    return { ...s, rateFromPrev, meaning: tone(meaningFor(s.key, rateFromPrev, s.value, prev ?? null)) };
  });
  const byDate = new Map<string, DailyPoint>();
  sources.forEach((src) =>
    src.days.forEach((d, i) => {
      const key = d.date ?? String(i);
      const cur = byDate.get(key) ?? { date: d.date ?? key, spend: 0, clicks: 0, impressions: 0 };
      cur.spend = convertible ? (cur.spend ?? 0) + src.spend(d) * m(src.currency) : null;
      cur.clicks += d.clicks;
      cur.impressions += d.impressions;
      byDate.set(key, cur);
    }),
  );
  return {
    spendPrev,
    channels: sources.map((s) => ({ name: s.name, spend: sum(s.days, s.spend) * m(s.currency) })),
    daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    verdict:
      input.days <= 1
        ? {
            level: "info",
            headline: input.today ? "오늘은 아직 하루가 끝나지 않았다 — 판정 보류" : "하루치 데이터 — 판정 보류",
            detail: "하루는 표본이 작아 '봇 의심·낭비 의심·결제 없음' 같은 결론을 내리지 않습니다. 아래 시간별 그래프는 어떤 시간대에 광고비·클릭·사용자가 움직였는지 보는 용도입니다.",
            action: "추세 판단은 7일 이상으로 보고, 오늘은 새로 켠 캠페인이 제대로 돌기 시작했는지(노출·클릭이 붙는지)만 확인한다.",
          }
        : verdictFor({ impressions, clicks, users: input.realUsers, orders: input.orders, bots: input.botUsers ?? null, suspect: input.suspect ?? null, spend, currency: plan.currency ?? "KRW", signups: input.signups ?? null, primary: input.primary ?? "orders" }),
    spend,
    currency: plan.currency ?? "KRW",
    spendNote,
    fxNote: convertible ? plan.note : null,
    steps,
    costPerUser: spend !== null && input.realUsers ? spend / input.realUsers : null,
    costPerOrder: spend !== null && input.orders ? spend / input.orders : null,
    signups: input.signups ?? null,
    signupsPrev: input.today ? null : input.signupsPrev ?? null,
    costPerSignup: spend !== null && input.signups ? spend / input.signups : null,
    primary: input.primary ?? "orders",
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
  if (key === "signups" && value !== null) {
    const users = prev ?? 0;
    if (value === 0 && users < MIN_USERS_FOR_CVR) return { level: "warn", rateName: "방문 대비 가입", text: `방문 ${users}명으로는 가입 0명이 이상하지 않다. 가입보다 진짜 방문을 먼저 늘려야 한다.` };
    if (value === 0) return { level: "bad", rateName: "방문 대비 가입", text: `사람 ${users.toLocaleString("ko-KR")}명이 왔는데 가입 0명 — 가입 버튼·가입 절차(소셜 로그인·이메일 확인)를 봐야 한다.` };
    return { level: "info", rateName: "방문 대비 가입", text: "가입한 사람 수는 개수만 센다(광고로 온 사람인지는 가르지 않음)." };
  }
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

// 봇 의심 결론의 근거. '어디서 온 짧은 방문인가'를 데이터로 말하고, 근거 없는 지면을 탓하지 않으려고 쓴다.
export type SuspectContext = {
  datacenterUsers: number; // 데이터센터 도시(Ashburn 등) — 사람이 아님
  lowEngagementUsers: number; // 평균 참여가 짧은 국가 — 사람일 수도 있음(바로 나간 방문)
  paidRows: { campaign: string; sourceMedium: string; sessions: number; engaged: number }[]; // GA4 유료 유입 캠페인×소스(ig / paid, fb / paid …). campaign은 사람이 읽는 이름
  placements: { platform: string; position: string; spend: number; clicks: number }[] | null; // 메타 노출 위치별 지출
  googleLive: boolean; // 구글 광고가 이 기간 집행 중(지출 있고 꺼지지 않음)
};

const LOW_RATE = 0.5; // 유료 유입 참여율이 이보다 낮으면 '대부분 바로 나감'
const MIN_ROW_SESSIONS = 5;
const POSITION_LABEL: Record<string, string> = { feed: "피드", facebook_reels: "릴스", facebook_stories: "스토리", instream_video: "인스트림 영상", marketplace: "마켓플레이스" };
const isFb = (sm: string) => /^(fb|facebook|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com|facebook\.com)\s*\//i.test(sm.trim());
const isIg = (sm: string) => /^(ig|instagram|instagram\.com|l\.instagram\.com)\s*\//i.test(sm.trim());

// 봇 의심 결론의 행동 제안: 실제로 짧은 방문을 만든 곳(캠페인·노출 위치)을 짚는다.
export function suspectAction(s: SuspectContext | null): { action: string; adSide: boolean; humanShort: boolean } {
  const generic = "GA4 소스/매체별 참여를 보고 짧은 방문이 어느 광고·지면에서 왔는지부터 확인한다.";
  if (!s) return { action: generic, adSide: false, humanShort: false };
  const parts: string[] = [];
  const humanShort = s.datacenterUsers + s.lowEngagementUsers > 0 && s.lowEngagementUsers >= s.datacenterUsers; // 대부분 '짧게 머문 사람'이지 데이터센터 봇이 아님
  const pl = s.placements ?? [];
  const plSpend = pl.reduce((a, p) => a + p.spend, 0);
  const plClicks = pl.reduce((a, p) => a + p.clicks, 0);
  const onPlatform = (name: string) => pl.filter((p) => p.platform === name);
  const pct = (v: number, t: number) => `${Math.round((v / t) * 100)}%`;
  const an = onPlatform("audience_network").reduce((a, p) => a + p.spend, 0);
  if (plSpend > 0 && an / plSpend >= 0.05) parts.push(`메타 광고비의 ${pct(an, plSpend)}가 오디언스 네트워크(외부 앱)에 쓰였다 — 이 지면을 끈다.`);
  // 유료 유입 중 대부분 바로 나간 캠페인×소스(방문 많은 순)
  const short = s.paidRows.filter((r) => r.sessions >= MIN_ROW_SESSIONS && r.engaged / r.sessions < LOW_RATE).sort((a, b) => b.sessions - a.sessions);
  const label = (c: string) => { const t = c.replace(/^Instagram (post|게시물):\s*/i, "").split("\n")[0]; return t.length > 24 ? `${t.slice(0, 23)}…` : t; };
  const where = (sm: string) => (isFb(sm) ? "페이스북" : isIg(sm) ? "인스타그램" : sm.trim());
  if (short.length) {
    parts.push(`짧은 방문이 몰린 광고: ${short.slice(0, 2).map((r) => `'${label(r.campaign)}' ${where(r.sourceMedium)} 방문 ${r.sessions}회 중 참여 ${r.engaged}회`).join(", ")}.`);
    const fbSpend = onPlatform("facebook").reduce((a, p) => a + p.spend, 0);
    const fbClicks = onPlatform("facebook").reduce((a, p) => a + p.clicks, 0);
    if (short.some((r) => isFb(r.sourceMedium)) && plSpend > 0 && fbSpend / plSpend >= 0.2) {
      const top = onPlatform("facebook").sort((a, b) => b.spend - a.spend)[0];
      parts.push(`메타 광고비의 ${pct(fbSpend, plSpend)}가 페이스북${top ? `(주로 ${POSITION_LABEL[top.position] ?? top.position})` : ""}에 쓰였고${plClicks ? ` 클릭의 ${pct(fbClicks, plClicks)}가 거기서 나왔다` : ""} — 노출 위치를 인스타그램으로 한정한다.`);
    }
    if (isIg(short[0].sourceMedium)) parts.push("인스타그램 쪽은 지면보다 소재·타깃(국가·관심사) 문제다 — 첫 장면과 타깃 국가를 좁혀 본다.");
  }
  if (s.googleLive && !parts.length) parts.push("구글은 검색 파트너·디스플레이 확장을 끄고 국가를 판매 국가로 좁힌다.");
  if (s.datacenterUsers > 0 && !humanShort) parts.push(`데이터센터 도시 방문 ${s.datacenterUsers.toLocaleString("ko-KR")}명은 사람이 아니다(광고와 무관한 크롤러일 수 있음).`);
  return { action: parts.length ? parts.join(" ") : generic, adSide: parts.length > 0 && (short.length > 0 || an > 0 || s.googleLive), humanShort };
}

function verdictFor(x: { impressions: number | null; clicks: number | null; users: number | null; orders: number | null; bots: number | null; suspect?: SuspectContext | null; spend: number | null; currency: string; signups: number | null; primary: "signups" | "orders" }): Verdict | null {
  const { impressions, clicks, users, orders, bots } = x;
  const k = (v: number) => v.toLocaleString("ko-KR");
  const won = (v: number) => (x.currency === "KRW" ? `${k(Math.round(v))}원` : `${v.toFixed(2)} ${x.currency}`);
  if (users !== null && bots && bots > users) {
    const share = bots / (bots + users);
    const why = suspectAction(x.suspect ?? null);
    // 대부분이 데이터센터가 아니라 '몇 초 만에 나간 방문'이면 봇이라고 단정하지 않는다(페이스북 피드 클릭 등 사람이 바로 나간 경우가 많다).
    return {
      level: why.adSide || !why.humanShort ? "bad" : "warn",
      headline: why.humanShort ? `사이트 방문의 ${Math.round(share * 100)}%가 몇 초 만에 나감(봇 의심 포함)` : `사이트 방문의 ${Math.round(share * 100)}%가 봇 의심`,
      detail: why.humanShort
        ? `GA4 사용자 ${k(bots + users)}명 중 ${k(bots)}명이 평균 참여 5초 미만 국가·데이터센터에서 왔다. 대부분은 데이터센터 봇이 아니라 광고를 누르고 바로 나간 방문이다.`
        : `GA4에 찍힌 사용자 ${k(bots + users)}명 중 실제 사람으로 보이는 건 ${k(users)}명뿐이다. 광고비가 사람이 아닌 트래픽에 쓰이고 있을 가능성이 크다.`,
      action: why.action,
      adSide: why.adSide,
    };
  }
  if (clicks && users !== null && users / clicks < ARRIVE_LOW) {
    const ctr = impressions ? clicks / impressions : null;
    return {
      level: "bad",
      headline: "광고 클릭이 사람 방문으로 이어지지 않음",
      detail: `클릭 ${k(clicks)}번에 실사용자 ${k(users)}명(${p1(users / clicks)}).${ctr !== null && ctr > CTR_HIGH ? ` 클릭률 ${p1(ctr)}도 비정상적으로 높아 실수·봇 클릭일 가능성이 크다.` : " 페이지가 느리거나 클릭 직후 이탈한다."}`,
      action: "지면을 피드·릴스로 한정하고, 최적화 목표를 '링크 클릭'이 아닌 '랜딩 페이지 조회'나 '리드'로 바꾼다.",
      adSide: true,
    };
  }
  // 가입이 핵심 전환인 브랜드(무료 가입형): 결제 대신 가입으로 흐름을 본다.
  if (x.primary === "signups" && x.signups !== null) {
    if (x.signups === 0 && users !== null && users >= MIN_USERS_FOR_CVR) {
      return { level: "bad", headline: "사람은 오는데 가입이 없음", detail: `실사용자 ${k(users)}명, 가입 0명. 트래픽 문제가 아니라 사이트 안(가입 버튼·가입 절차) 문제다.`, action: "가입 버튼까지 가는 비율을 GA4 이벤트로 확인하고, 가입 절차(소셜 로그인·이메일 확인)를 직접 해 본다." };
    }
    if (x.signups === 0) {
      return { level: "warn", headline: "가입을 판단하기엔 방문이 너무 적음", detail: `실사용자 ${users === null ? "-" : k(users)}명. 지금 가입 0명은 사이트 탓이라고 보기 어렵다.`, action: "광고비를 늘리기 전에 사람이 실제로 오는 지면·국가로 좁혀 '실사용자 1명당 광고비'부터 낮춘다." };
    }
    if (x.spend !== null) {
      return { level: "good", headline: "광고부터 가입까지 흐름이 이어지고 있음", detail: `신규 가입 ${k(x.signups)}명, 가입 1명당 광고비 ${won(x.spend / x.signups)}. 가입은 광고 밖 유입 가입도 함께 센 최소치다.`, action: "가입 1명당 광고비를 기간별로 비교해 오르는 캠페인부터 줄인다." };
    }
  }
  if (x.primary === "signups" && x.signups !== null) return null; // 가입이 핵심이면 결제 0건으로 판정하지 않는다
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
