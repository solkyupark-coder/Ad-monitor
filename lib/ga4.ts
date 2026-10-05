// GA4 Data API 읽기 전용 조회(scope: analytics.readonly). 토큰 값은 화면·로그에 내지 않는다.
import { googleAccessToken } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { splitTraffic, flagSources, type FlaggedGeo, type FlaggedSource, type GeoRow, type SourceRow, type TrafficSplit } from "@/lib/traffic";

export type Ga4Totals = {
  activeUsers: number;
  sessions: number;
  engagedSessions: number;
  engagementRate: number; // 참여 세션 / 세션
  avgEngagementSec: number; // 세션당 평균 참여시간
  purchases: number;
  revenue: number;
};

export type Ga4Summary =
  | {
      ok: true;
      currency: string;
      d7: Ga4Totals;
      d28: Ga4Totals;
      sources: FlaggedSource[]; // 세션 순 상위(최대 25), 화면에는 10개
      geo: FlaggedGeo[];
      split: TrafficSplit; // 7일 기준 의심 트래픽 분리
      geoTruncated: boolean;
    }
  | { ok: false; reason: string };

type GaRow = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
type GaResp = { rows?: GaRow[]; rowCount?: number; metadata?: { currencyCode?: string } };

const RANGE_7 = { startDate: "7daysAgo", endDate: "yesterday" };
const RANGE_28 = { startDate: "28daysAgo", endDate: "yesterday" };
const GEO_LIMIT = 250;

const num = (r: GaRow, i: number) => Number(r.metricValues?.[i]?.value ?? 0);

function totalsOf(r: GaRow | undefined): Ga4Totals {
  if (!r) return { activeUsers: 0, sessions: 0, engagedSessions: 0, engagementRate: 0, avgEngagementSec: 0, purchases: 0, revenue: 0 };
  const sessions = num(r, 1);
  const engaged = num(r, 2);
  return {
    activeUsers: num(r, 0),
    sessions,
    engagedSessions: engaged,
    engagementRate: sessions ? engaged / sessions : 0,
    avgEngagementSec: sessions ? num(r, 3) / sessions : 0,
    purchases: num(r, 4),
    revenue: num(r, 5),
  };
}

export async function ga4Summary(brand: BrandId): Promise<Ga4Summary> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const refresh = process.env.GA_REFRESH_TOKEN;
  const propertyId = (process.env[`${prefix}_GA4_PROPERTY_ID`] ?? "").replace(/\D/g, "");
  if (!refresh || !propertyId) return { ok: false, reason: "자격증명 없음" };
  try {
    const token = await googleAccessToken(refresh);
    if (!token) return { ok: false, reason: "토큰 갱신 실패 — analytics.readonly 동의를 다시 받아 GA_REFRESH_TOKEN을 교체하세요" };
    const run = (body: object) =>
      fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        next: { revalidate: 600 }, // 쿼터 절약: 10분 캐시
      });
    const [ov, src, geo] = await Promise.all([
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
      run({
        dateRanges: [RANGE_7],
        dimensions: [{ name: "country" }, { name: "city" }],
        metrics: ["activeUsers", "sessions", "userEngagementDuration", "ecommercePurchases", "purchaseRevenue"].map((name) => ({ name })),
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: GEO_LIMIT,
      }),
    ]);
    const bad = [ov, src, geo].find((r) => !r.ok);
    if (bad) {
      if (bad.status === 401) return { ok: false, reason: "토큰 거절 — GA_REFRESH_TOKEN을 다시 발급하세요" };
      if (bad.status === 403) return { ok: false, reason: "권한 없음 — 이 구글 계정이 해당 GA4 속성에 접근할 수 있는지 확인하세요" };
      if (bad.status === 400 || bad.status === 404) return { ok: false, reason: "속성 ID를 확인하세요" };
      if (bad.status === 429) return { ok: false, reason: "조회 한도 초과 — 잠시 뒤 다시 시도됩니다" };
      return { ok: false, reason: "조회 실패" };
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

    const geoJson = (await geo.json()) as GaResp;
    const geoRows: GeoRow[] = (geoJson.rows ?? []).map((r) => ({
      country: r.dimensionValues?.[0]?.value ?? "(알 수 없음)",
      city: r.dimensionValues?.[1]?.value ?? "(알 수 없음)",
      activeUsers: num(r, 0),
      sessions: num(r, 1),
      engagementSec: num(r, 2),
      purchases: num(r, 3),
      revenue: num(r, 4),
    }));
    const { flagged, split } = splitTraffic(geoRows, d7.activeUsers, d7.sessions);
    return {
      ok: true,
      currency: ovJson.metadata?.currencyCode ?? "",
      d7,
      d28,
      sources: flagSources(sources),
      geo: flagged,
      split,
      geoTruncated: (geoJson.rowCount ?? geoRows.length) > GEO_LIMIT,
    };
  } catch {
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
