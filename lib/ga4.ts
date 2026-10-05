// GA4 Data API 읽기 전용 조회(scope: analytics.readonly). 토큰 값은 화면·로그에 내지 않는다.
import { googleToken, logFailure, tokenFailureReason } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import type { DateRange } from "@/lib/range";
import type { GaCampaignRow } from "@/lib/effect";
import { blocklistFor, ga4BlockedExpression, isBlockedSource } from "@/lib/blocklist";
import { DATACENTER_CITIES, excludeSuspect, splitTraffic, flagSources, type FlaggedGeo, type FlaggedSource, type GeoRow, type SourceRow, type Totals, type TrafficSplit } from "@/lib/traffic";

export type Ga4Totals = {
  activeUsers: number;
  sessions: number;
  engagedSessions: number;
  engagementSec: number; // 참여시간 합계(초)
  engagementRate: number; // 참여 세션 / 세션
  avgEngagementSec: number; // 세션당 평균 참여시간
  purchases: number;
  revenue: number;
};

export type Ga4Summary =
  | {
      ok: true;
      currency: string;
      total: Ga4Totals; // 선택 기간 전체(의심 포함)
      totalPrev: Ga4Totals; // 직전 기간 전체
      real: Ga4Totals; // 선택 기간, 의심 트래픽을 뺀 실수치 — 화면 기본값
      realPrev: Ga4Totals; // 직전 기간 실수치
      sources: FlaggedSource[]; // 세션 순 상위(최대 25), 화면에는 의심 아닌 것 10개
      geo: FlaggedGeo[]; // 선택 기간
      split: TrafficSplit; // 선택 기간 의심 트래픽 분리
      splitPrev: TrafficSplit;
      geoTruncated: boolean;
      campaigns: GaCampaignRow[] | null; // 캠페인×소스/매체 유입(데이터센터 도시 제외). 못 읽으면 null
      campaignsTruncated: boolean; // 행이 많아 일부만 읽음
      blocked: { sessions: number; users: number } | null; // 리워드·클릭팜(PTC) 유입으로 보고 위 모든 수치에서 뺀 양. 못 읽으면 null
    }
  | { ok: false; reason: string };

type GaRow = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
type GaResp = { rows?: GaRow[]; rowCount?: number; metadata?: { currencyCode?: string } };

const GEO_LIMIT = 250;
const CAMPAIGN_LIMIT = 250;

const num = (r: GaRow, i: number) => Number(r.metricValues?.[i]?.value ?? 0);

export function withRates(t: Totals): Ga4Totals {
  return {
    ...t,
    engagementRate: t.sessions ? t.engagedSessions / t.sessions : 0,
    avgEngagementSec: t.sessions ? t.engagementSec / t.sessions : 0,
  };
}

function totalsOf(r: GaRow | undefined): Ga4Totals {
  if (!r) return withRates({ activeUsers: 0, sessions: 0, engagedSessions: 0, engagementSec: 0, purchases: 0, revenue: 0 });
  return withRates({
    activeUsers: num(r, 0),
    sessions: num(r, 1),
    engagedSessions: num(r, 2),
    engagementSec: num(r, 3),
    purchases: num(r, 4),
    revenue: num(r, 5),
  });
}

// 조회 결과를 화면용 요약으로 묶는다(데모 데이터도 같은 경로를 쓴다).
export function assembleGa4(input: {
  currency: string;
  total: Ga4Totals;
  totalPrev: Ga4Totals;
  sources: SourceRow[];
  geoCur: GeoRow[];
  geoPrev: GeoRow[];
  geoTruncated: boolean;
  campaigns?: GaCampaignRow[] | null;
  campaignsTruncated?: boolean;
  blocked?: { sessions: number; users: number } | null;
}): Ga4Summary {
  const sCur = splitTraffic(input.geoCur, input.total.activeUsers, input.total.sessions);
  const sPrev = splitTraffic(input.geoPrev, input.totalPrev.activeUsers, input.totalPrev.sessions);
  return {
    ok: true,
    currency: input.currency,
    total: input.total,
    totalPrev: input.totalPrev,
    real: withRates(excludeSuspect(input.total, sCur.split)),
    realPrev: withRates(excludeSuspect(input.totalPrev, sPrev.split)),
    sources: flagSources(input.sources),
    geo: sCur.flagged,
    split: sCur.split,
    splitPrev: sPrev.split,
    geoTruncated: input.geoTruncated,
    campaigns: input.campaigns ?? null,
    campaignsTruncated: input.campaignsTruncated ?? false,
    blocked: input.blocked ?? null,
  };
}

export async function ga4Summary(brand: BrandId, range: DateRange): Promise<Ga4Summary> {
  const rCur = { startDate: range.from, endDate: range.to };
  const rPrev = { startDate: range.prev.from, endDate: range.prev.to };
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const refresh = process.env.GA_REFRESH_TOKEN;
  const propertyId = (process.env[`${prefix}_GA4_PROPERTY_ID`] ?? "").replace(/\D/g, "");
  if (!refresh || !propertyId) return { ok: false, reason: "자격증명 없음" };
  try {
    const t = await googleToken(refresh);
    if (!t.ok) {
      logFailure("ga4", brand, `token ${t.error}`);
      return { ok: false, reason: tokenFailureReason(t.error, "GA_REFRESH_TOKEN") };
    }
    const token = t.token;
    // 리워드·클릭팜(PTC) 유입은 요청 단계에서 빼서 합계·소스·지역·캠페인 수치가 서로 어긋나지 않게 한다.
    const blockList = blocklistFor(prefix);
    const ptcFilter = ga4BlockedExpression(blockList);
    const notPtc = { notExpression: ptcFilter };
    const run = (body: object) =>
      fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        next: { revalidate: 600 }, // 쿼터 절약: 10분 캐시
      });
    const geoReport = (range: object) =>
      run({
        dateRanges: [range],
        dimensions: [{ name: "country" }, { name: "city" }],
        metrics: ["activeUsers", "sessions", "userEngagementDuration", "ecommercePurchases", "purchaseRevenue", "engagedSessions"].map((name) => ({ name })),
        dimensionFilter: notPtc,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: GEO_LIMIT,
      });
    // 광고 효과 판정용: 캠페인 이름 × 소스/매체. 데이터센터 도시는 요청 단계에서 뺀다(차원에 없어도 필터 가능).
    const campaignReport = run({
      dateRanges: [rCur],
      dimensions: [{ name: "sessionCampaignName" }, { name: "sessionSourceMedium" }],
      metrics: ["sessions", "engagedSessions", "userEngagementDuration"].map((name) => ({ name })),
      dimensionFilter: { andGroup: { expressions: [{ notExpression: { filter: { fieldName: "city", inListFilter: { values: DATACENTER_CITIES } } } }, notPtc] } },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: CAMPAIGN_LIMIT,
    });
    // 얼마나 뺐는지 보여 주기 위한 별도 조회(실패해도 나머지 카드는 그대로).
    const ptcReport = run({
      dateRanges: [rCur],
      metrics: ["sessions", "activeUsers"].map((name) => ({ name })),
      dimensionFilter: ptcFilter,
    });
    const [ov, src, geo, geoPrev, camp, ptc] = await Promise.all([
      run({
        dateRanges: [rCur, rPrev],
        dimensionFilter: notPtc,
        metrics: ["activeUsers", "sessions", "engagedSessions", "userEngagementDuration", "ecommercePurchases", "purchaseRevenue"].map((name) => ({ name })),
      }),
      run({
        dateRanges: [rCur],
        dimensions: [{ name: "sessionSourceMedium" }],
        metrics: ["sessions", "activeUsers", "engagedSessions", "userEngagementDuration"].map((name) => ({ name })),
        dimensionFilter: notPtc,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 25,
      }),
      geoReport(rCur),
      geoReport(rPrev),
      campaignReport,
      ptcReport,
    ]);
    const bad = [ov, src, geo, geoPrev].find((r) => !r.ok);
    if (bad) {
      const err = ((await bad.json().catch(() => ({}))) as { error?: { status?: string; message?: string } }).error;
      const code = err?.status ?? `HTTP ${bad.status}`;
      logFailure("ga4", brand, `property ${propertyId} ${bad.status} ${code} ${err?.message ?? ""}`.trim());
      if (bad.status === 401) return { ok: false, reason: `토큰 거절 — GA_REFRESH_TOKEN을 다시 발급하세요 (${code})` };
      if (bad.status === 403) {
        if (/insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(err?.message ?? "")) {
          return { ok: false, reason: `GA_REFRESH_TOKEN에 analytics.readonly 범위가 없습니다 — 그 범위로 다시 발급하세요 (${code})` };
        }
        if (/has not been used|is disabled|SERVICE_DISABLED/i.test(err?.message ?? "")) {
          return { ok: false, reason: `Cloud 프로젝트에서 Google Analytics Data API를 사용 설정하세요 (${code})` };
        }
        return { ok: false, reason: `권한 없음 — 토큰을 발급한 구글 계정이 GA4 속성 ${propertyId}에 접근할 수 있는지 확인하세요 (${code})` };
      }
      if (bad.status === 400 || bad.status === 404) return { ok: false, reason: `속성 ID ${propertyId}를 확인하세요 (${code})` };
      if (bad.status === 429) return { ok: false, reason: "조회 한도 초과 — 잠시 뒤 다시 시도됩니다" };
      return { ok: false, reason: `조회 실패 (${code})` };
    }
    const ovJson = (await ov.json()) as GaResp;
    const byRange = (key: string) => ovJson.rows?.find((r) => r.dimensionValues?.[0]?.value === key);
    const total = totalsOf(byRange("date_range_0"));
    const totalPrev = totalsOf(byRange("date_range_1"));

    const sources: SourceRow[] = (((await src.json()) as GaResp).rows ?? []).filter((r) => !isBlockedSource(r.dimensionValues?.[0]?.value ?? "", blockList)).map((r) => ({
      sourceMedium: r.dimensionValues?.[0]?.value ?? "(알 수 없음)",
      sessions: num(r, 0),
      activeUsers: num(r, 1),
      engagedSessions: num(r, 2),
      engagementSec: num(r, 3),
    }));

    const toGeo = (j: GaResp): GeoRow[] =>
      (j.rows ?? []).map((r) => ({
        country: r.dimensionValues?.[0]?.value ?? "(알 수 없음)",
        city: r.dimensionValues?.[1]?.value ?? "(알 수 없음)",
        activeUsers: num(r, 0),
        sessions: num(r, 1),
        engagementSec: num(r, 2),
        purchases: num(r, 3),
        revenue: num(r, 4),
        engagedSessions: num(r, 5),
      }));
    const geoJson = (await geo.json()) as GaResp;
    const geoPrevJson = (await geoPrev.json()) as GaResp;
    let campaigns: GaCampaignRow[] | null = null;
    let campaignsTruncated = false;
    if (camp.ok) {
      const campJson = (await camp.json()) as GaResp;
      campaignsTruncated = (campJson.rowCount ?? campJson.rows?.length ?? 0) > CAMPAIGN_LIMIT;
      campaigns = (campJson.rows ?? []).map((r) => ({
        campaign: r.dimensionValues?.[0]?.value ?? "(not set)",
        sourceMedium: r.dimensionValues?.[1]?.value ?? "",
        sessions: num(r, 0),
        engagedSessions: num(r, 1),
        engagementSec: num(r, 2),
      }));
    } else {
      logFailure("ga4", brand, `campaign report ${camp.status}`); // 효과 판정만 빠지고 나머지 카드는 그대로
    }
    let blocked: { sessions: number; users: number } | null = null;
    if (ptc.ok) {
      const row = ((await ptc.json()) as GaResp).rows?.[0];
      blocked = { sessions: row ? num(row, 0) : 0, users: row ? num(row, 1) : 0 };
    } else {
      logFailure("ga4", brand, `ptc report ${ptc.status}`);
    }
    return assembleGa4({
      currency: ovJson.metadata?.currencyCode ?? "",
      total,
      totalPrev,
      sources,
      geoCur: toGeo(geoJson),
      geoPrev: toGeo(geoPrevJson),
      geoTruncated: [geoJson, geoPrevJson].some((j) => (j.rowCount ?? j.rows?.length ?? 0) > GEO_LIMIT),
      campaigns,
      campaignsTruncated,
      blocked,
    });
  } catch (e) {
    logFailure("ga4", brand, `network ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
