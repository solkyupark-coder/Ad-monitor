// GA4 Data API 읽기 전용 조회(scope: analytics.readonly). 토큰 값은 화면·로그에 내지 않는다.
import { googleToken, logFailure, tokenFailureReason } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { excludeSuspect, splitTraffic, flagSources, type FlaggedGeo, type FlaggedSource, type GeoRow, type SourceRow, type Totals, type TrafficSplit } from "@/lib/traffic";

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
      d7: Ga4Totals; // 전체(의심 포함)
      d28: Ga4Totals;
      real7: Ga4Totals; // 의심 트래픽을 뺀 실수치 — 화면 기본값
      real28: Ga4Totals;
      sources: FlaggedSource[]; // 세션 순 상위(최대 25), 화면에는 의심 아닌 것 10개
      geo: FlaggedGeo[]; // 7일
      split: TrafficSplit; // 7일 기준 의심 트래픽 분리
      split28: TrafficSplit;
      geoTruncated: boolean;
    }
  | { ok: false; reason: string };

type GaRow = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
type GaResp = { rows?: GaRow[]; rowCount?: number; metadata?: { currencyCode?: string } };

const RANGE_7 = { startDate: "7daysAgo", endDate: "yesterday" };
const RANGE_28 = { startDate: "28daysAgo", endDate: "yesterday" };
const GEO_LIMIT = 250;

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
  d7: Ga4Totals;
  d28: Ga4Totals;
  sources: SourceRow[];
  geo7: GeoRow[];
  geo28: GeoRow[];
  geoTruncated: boolean;
}): Ga4Summary {
  const s7 = splitTraffic(input.geo7, input.d7.activeUsers, input.d7.sessions);
  const s28 = splitTraffic(input.geo28, input.d28.activeUsers, input.d28.sessions);
  return {
    ok: true,
    currency: input.currency,
    d7: input.d7,
    d28: input.d28,
    real7: withRates(excludeSuspect(input.d7, s7.split)),
    real28: withRates(excludeSuspect(input.d28, s28.split)),
    sources: flagSources(input.sources),
    geo: s7.flagged,
    split: s7.split,
    split28: s28.split,
    geoTruncated: input.geoTruncated,
  };
}

export async function ga4Summary(brand: BrandId): Promise<Ga4Summary> {
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
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: GEO_LIMIT,
      });
    const [ov, src, geo, geo28] = await Promise.all([
      run({
        dateRanges: [RANGE_7, RANGE_28],
        metrics: ["activeUsers", "sessions", "engagedSessions", "userEngagementDuration", "ecommercePurchases", "purchaseRevenue"].map((name) => ({ name })),
      }),
      run({
        dateRanges: [RANGE_7],
        dimensions: [{ name: "sessionSourceMedium" }],
        metrics: ["sessions", "activeUsers", "engagedSessions", "userEngagementDuration"].map((name) => ({ name })),
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 25,
      }),
      geoReport(RANGE_7),
      geoReport(RANGE_28),
    ]);
    const bad = [ov, src, geo, geo28].find((r) => !r.ok);
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
    const d7 = totalsOf(byRange("date_range_0"));
    const d28 = totalsOf(byRange("date_range_1"));

    const sources: SourceRow[] = (((await src.json()) as GaResp).rows ?? []).map((r) => ({
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
    const geo28Json = (await geo28.json()) as GaResp;
    return assembleGa4({
      currency: ovJson.metadata?.currencyCode ?? "",
      d7,
      d28,
      sources,
      geo7: toGeo(geoJson),
      geo28: toGeo(geo28Json),
      geoTruncated: [geoJson, geo28Json].some((j) => (j.rowCount ?? j.rows?.length ?? 0) > GEO_LIMIT),
    });
  } catch (e) {
    logFailure("ga4", brand, `network ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
