// 의심 트래픽(봇·데이터센터) 판별과 광고·매출 비교 로직. 순수 함수만 둔다(테스트하기 쉽게 외부 import 없음).

// 데이터센터가 몰린 도시. 휴리스틱이라 실사용자가 섞일 수 있다(예: Columbus). 필요하면 여기서 조정한다.
export const DATACENTER_CITIES = ["Ashburn", "Boardman", "Council Bluffs", "The Dalles", "Drexel Hill", "Columbus"];
export const LOW_ENGAGEMENT_SEC = 5; // 세션당 평균 참여시간이 이보다 짧으면 의심
export const MIN_SESSIONS_FOR_FLAG = 5; // 표본이 이보다 적으면 판정하지 않는다

export type GeoRow = {
  country: string;
  city: string;
  activeUsers: number;
  sessions: number;
  engagementSec: number; // 참여시간 합계(초)
  purchases: number;
  revenue: number;
};
export type SourceRow = { sourceMedium: string; sessions: number; activeUsers: number; engagedSessions: number; engagementSec: number };

const datacenter = new Set(DATACENTER_CITIES.map((c) => c.toLowerCase()));
export const isDatacenterCity = (city: string): boolean => datacenter.has(city.trim().toLowerCase());
export const avgSec = (totalSec: number, sessions: number): number => (sessions > 0 ? totalSec / sessions : 0);
export const isLowEngagement = (sessions: number, totalSec: number): boolean =>
  sessions >= MIN_SESSIONS_FOR_FLAG && avgSec(totalSec, sessions) < LOW_ENGAGEMENT_SEC;

export type CountryRow = { country: string; activeUsers: number; sessions: number; engagementSec: number; purchases: number; lowEngagement: boolean };

export function byCountry(rows: GeoRow[]): CountryRow[] {
  const m = new Map<string, CountryRow>();
  for (const r of rows) {
    const c = m.get(r.country) ?? { country: r.country, activeUsers: 0, sessions: 0, engagementSec: 0, purchases: 0, lowEngagement: false };
    c.activeUsers += r.activeUsers;
    c.sessions += r.sessions;
    c.engagementSec += r.engagementSec;
    c.purchases += r.purchases;
    m.set(r.country, c);
  }
  return [...m.values()]
    .map((c) => ({ ...c, lowEngagement: isLowEngagement(c.sessions, c.engagementSec) }))
    .sort((a, b) => b.sessions - a.sessions);
}

export type FlagReason = "datacenter" | "low-engagement";
export type FlaggedGeo = GeoRow & { flag: FlagReason | null };

export type TrafficSplit = {
  totalUsers: number;
  suspectUsers: number;
  realUsers: number;
  totalSessions: number;
  suspectSessions: number;
  suspectShare: number; // 세션 기준 의심 비율(0~1)
  datacenterUsers: number;
  lowEngagementUsers: number;
  suspectPurchases: number;
  datacenterPurchases: number;
  suspectCountries: CountryRow[];
};

// 지역 행을 판정한다. 국가×도시 합계는 사용자를 중복 계산할 수 있어, 합계는 속성 전체 값으로 상한을 둔다.
export function splitTraffic(rows: GeoRow[], totalUsers: number, totalSessions: number): { flagged: FlaggedGeo[]; split: TrafficSplit } {
  // 국가 단위 판정에서는 이미 데이터센터로 분류한 행을 뺀다. 안 그러면 봇이 평균을 끌어내려 정상 사용자까지 걸린다.
  const lowCountries = new Set(
    byCountry(rows.filter((r) => !isDatacenterCity(r.city)))
      .filter((c) => c.lowEngagement)
      .map((c) => c.country),
  );
  const flagged: FlaggedGeo[] = rows.map((r) => ({
    ...r,
    flag: isDatacenterCity(r.city) ? "datacenter" : lowCountries.has(r.country) ? "low-engagement" : null,
  }));
  const sum = (f: (r: FlaggedGeo) => number, only?: FlagReason) =>
    flagged.filter((r) => (only ? r.flag === only : r.flag !== null)).reduce((a, r) => a + f(r), 0);
  const suspectUsers = Math.min(totalUsers, sum((r) => r.activeUsers));
  const suspectSessions = Math.min(totalSessions, sum((r) => r.sessions));
  return {
    flagged,
    split: {
      totalUsers,
      suspectUsers,
      realUsers: Math.max(0, totalUsers - suspectUsers),
      totalSessions,
      suspectSessions,
      suspectShare: totalSessions > 0 ? suspectSessions / totalSessions : 0,
      datacenterUsers: sum((r) => r.activeUsers, "datacenter"),
      lowEngagementUsers: sum((r) => r.activeUsers, "low-engagement"),
      suspectPurchases: sum((r) => r.purchases),
      datacenterPurchases: sum((r) => r.purchases, "datacenter"),
      suspectCountries: byCountry(rows.filter((r) => !isDatacenterCity(r.city))).filter((c) => c.lowEngagement),
    },
  };
}

export type FlaggedSource = SourceRow & { lowEngagement: boolean };
export function flagSources(rows: SourceRow[]): FlaggedSource[] {
  return rows.map((r) => ({ ...r, lowEngagement: isLowEngagement(r.sessions, r.engagementSec) }));
}

export const findGoogleCpc = (rows: SourceRow[]): SourceRow | undefined =>
  rows.find((r) => r.sourceMedium.replace(/\s/g, "").toLowerCase() === "google/cpc");

export type AdsEngagement = {
  sessions: number;
  engagedSessions: number;
  engagedPerClick: number | null; // 클릭당 실참여
  costPerEngaged: number | null; // 참여 세션당 비용
  avgEngagementSec: number;
  lowEngagement: boolean;
  missing: boolean; // GA에 google / cpc 유입이 없음
};

export function adsEngagement(adsClicks: number, adsCost: number, row: SourceRow | undefined): AdsEngagement {
  if (!row) {
    return { sessions: 0, engagedSessions: 0, engagedPerClick: null, costPerEngaged: null, avgEngagementSec: 0, lowEngagement: false, missing: true };
  }
  return {
    sessions: row.sessions,
    engagedSessions: row.engagedSessions,
    engagedPerClick: adsClicks > 0 ? row.engagedSessions / adsClicks : null,
    costPerEngaged: row.engagedSessions > 0 ? adsCost / row.engagedSessions : null,
    avgEngagementSec: avgSec(row.engagementSec, row.sessions),
    lowEngagement: isLowEngagement(row.sessions, row.engagementSec),
    missing: false,
  };
}

export type RevenueCompare = { level: "ok" | "warn" | "none"; message: string };

// GA purchase와 실제 결제를 비교한다. 금액은 통화가 같을 때만 비교한다.
export function compareRevenue(
  ga: { purchases: number; revenue: number; currency: string; datacenterPurchases: number },
  real: { orders: number; amount: number | null; currency: string } | null,
): RevenueCompare {
  if (!real) return { level: "none", message: "실매출 데이터를 읽지 못해 GA와 비교할 수 없습니다." };
  const dc = ga.datacenterPurchases > 0 ? ` (GA 구매 중 ${ga.datacenterPurchases}건은 데이터센터 도시에서 발생)` : "";
  if (ga.purchases > 0 && real.orders === 0) {
    return { level: "warn", message: `GA에는 구매 ${ga.purchases}건이 있지만 실제 결제는 0건입니다. GA purchase를 매출로 보면 안 됩니다${dc}.` };
  }
  if (ga.purchases !== real.orders) {
    return { level: "warn", message: `구매 건수가 다릅니다: GA ${ga.purchases}건 / 실제 결제 ${real.orders}건${dc}.` };
  }
  if (real.amount !== null && real.currency === ga.currency && ga.revenue > 0) {
    const diff = Math.abs(real.amount - ga.revenue) / ga.revenue;
    if (diff > 0.05) {
      return { level: "warn", message: `건수는 같지만 금액이 다릅니다: GA ${Math.round(ga.revenue)} / 실제 ${Math.round(real.amount)} ${real.currency}.` };
    }
  }
  return { level: "ok", message: "GA purchase와 실제 결제가 일치합니다." };
}
