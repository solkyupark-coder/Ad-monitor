// 분석용 GA4 자유 조회: 차원·지표·기간·필터를 받아 GA4 Data API(runReport / runRealtimeReport / metadata)를 그대로 부른다.
// ad-monitor-mcp의 ga4_report 도구가 /api/ga4/query로 부른다. 읽기 전용(analytics.readonly), 토큰 값은 응답·로그에 내지 않는다.
import { googleToken, logFailure, tokenFailureReason } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { blocklistFor, ga4BlockedExpression } from "@/lib/blocklist";
import { ga4NotInternalExpression, internalCitiesFor } from "@/lib/internal";
import { DATACENTER_CITIES } from "@/lib/traffic";

export type Ga4QueryInput = {
  brand: BrandId;
  kind?: "report" | "realtime" | "metadata";
  dimensions?: string[];
  metrics?: string[];
  startDate?: string; // YYYY-MM-DD 또는 GA4 상대값(7daysAgo, yesterday, today)
  endDate?: string;
  compareStartDate?: string; // 직전 기간 비교(선택)
  compareEndDate?: string;
  dimensionFilter?: object; // GA4 FilterExpression 그대로
  metricFilter?: object;
  orderBy?: { field: string; desc?: boolean }[]; // field가 metrics에 있으면 지표 정렬, 아니면 차원 정렬
  limit?: number;
  includeAll?: boolean; // true면 봇·클릭팜·본인 접속을 빼지 않은 원자료
};

export type Ga4QueryResult =
  | { ok: true; brand: BrandId; kind: string; dateRanges?: object[]; filtered: boolean; headers: string[]; rows: (string | number)[][]; rowCount: number; truncated: boolean; currency?: string; note?: string }
  | { ok: true; brand: BrandId; kind: "metadata"; dimensions: { name: string; label: string; category?: string }[]; metrics: { name: string; label: string; category?: string }[] }
  | { ok: false; reason: string };

const MAX_LIMIT = 1000;
const NAME = /^[A-Za-z0-9_:]+$/;
const DATE = /^(\d{4}-\d{2}-\d{2}|today|yesterday|\d+daysAgo)$/;

function clean(list: unknown, max: number, what: string): string[] {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new Error(`${what}는 배열이어야 합니다`);
  const out = list.map(String).map((s) => s.trim()).filter(Boolean);
  if (out.length > max) throw new Error(`${what}는 ${max}개까지입니다`);
  const bad = out.find((s) => !NAME.test(s));
  if (bad) throw new Error(`${what} 이름이 올바르지 않습니다: ${bad}`);
  return out;
}

// 대시보드와 같은 기준으로 '실사용자'만 남기는 필터: 리워드·클릭팜(PTC) 유입, 운영자 본인 도시, 데이터센터 도시를 뺀다.
function realUserFilter(prefix: string): object {
  const exprs: object[] = [{ notExpression: ga4BlockedExpression(blocklistFor(prefix)) }, { notExpression: { filter: { fieldName: "city", inListFilter: { values: DATACENTER_CITIES } } } }];
  const cities = internalCitiesFor(prefix);
  if (cities.length) exprs.push(ga4NotInternalExpression(cities));
  return { andGroup: { expressions: exprs } };
}

type GaResp = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
  rowCount?: number;
  metadata?: { currencyCode?: string };
  dimensions?: { apiName: string; uiName?: string; category?: string }[];
  metrics?: { apiName: string; uiName?: string; category?: string }[];
  error?: { message?: string; status?: string };
};

export async function ga4Query(input: Ga4QueryInput): Promise<Ga4QueryResult> {
  const brandDef = BRANDS.find((b) => b.id === input.brand);
  if (!brandDef) return { ok: false, reason: "brand는 topogenesis 또는 houscaper여야 합니다" };
  const refresh = process.env.GA_REFRESH_TOKEN;
  const propertyId = (process.env[`${brandDef.prefix}_GA4_PROPERTY_ID`] ?? "").replace(/\D/g, "");
  if (!refresh || !propertyId) return { ok: false, reason: "GA4 자격증명 없음(GA_REFRESH_TOKEN·속성 ID)" };
  const kind = input.kind ?? "report";

  let dims: string[];
  let mets: string[];
  try {
    dims = clean(input.dimensions, 9, "dimensions");
    mets = clean(input.metrics, 10, "metrics");
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  const t = await googleToken(refresh);
  if (!t.ok) {
    logFailure("ga4-query", input.brand, `token ${t.error}`);
    return { ok: false, reason: tokenFailureReason(t.error, "GA_REFRESH_TOKEN") };
  }
  const base = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}`;
  const call = async (url: string, body?: object): Promise<GaResp & { _status: number }> => {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${t.token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as GaResp;
    return { ...json, _status: res.status };
  };
  const fail = (r: GaResp & { _status: number }): Ga4QueryResult => {
    const msg = r.error?.message ?? `HTTP ${r._status}`;
    logFailure("ga4-query", input.brand, `property ${propertyId} ${r._status} ${r.error?.status ?? ""}`.trim());
    if (r._status === 403) return { ok: false, reason: `권한 없음 — 토큰을 발급한 구글 계정이 GA4 속성 ${propertyId}에 접근할 수 있는지 확인하세요` };
    return { ok: false, reason: `GA4 오류: ${msg.slice(0, 400)}` };
  };

  if (kind === "metadata") {
    const r = await call(`${base}/metadata`);
    if (r._status >= 400) return fail(r);
    return {
      ok: true,
      brand: input.brand,
      kind: "metadata",
      dimensions: (r.dimensions ?? []).map((d) => ({ name: d.apiName, label: d.uiName ?? d.apiName, category: d.category })),
      metrics: (r.metrics ?? []).map((m) => ({ name: m.apiName, label: m.uiName ?? m.apiName, category: m.category })),
    };
  }

  if (!mets.length) return { ok: false, reason: "metrics를 하나 이상 주세요(예: activeUsers, sessions, eventCount)" };
  const limit = Math.min(Math.max(1, Math.floor(input.limit ?? 100)), MAX_LIMIT);
  const orderBys = (input.orderBy ?? [])
    .filter((o) => o && NAME.test(String(o.field)))
    .map((o) => (mets.includes(o.field) ? { metric: { metricName: o.field }, desc: !!o.desc } : { dimension: { dimensionName: o.field }, desc: !!o.desc }));
  const sortDefault = orderBys.length ? orderBys : [{ metric: { metricName: mets[0] }, desc: true }];

  if (kind === "realtime") {
    // 최근 30분. 실시간 API는 유입 경로 차원이 없어 실사용자 필터를 걸 수 없다.
    const r = await call(`${base}:runRealtimeReport`, {
      dimensions: dims.map((name) => ({ name })),
      metrics: mets.map((name) => ({ name })),
      ...(input.dimensionFilter ? { dimensionFilter: input.dimensionFilter } : {}),
      ...(input.metricFilter ? { metricFilter: input.metricFilter } : {}),
      orderBys: sortDefault,
      limit,
    });
    if (r._status >= 400) return fail(r);
    return shape(input.brand, "realtime", undefined, false, r, limit, "최근 30분 실시간(봇·본인 제외 안 됨)");
  }

  const startDate = input.startDate ?? "7daysAgo";
  const endDate = input.endDate ?? "yesterday";
  if (!DATE.test(startDate) || !DATE.test(endDate)) return { ok: false, reason: "startDate/endDate는 YYYY-MM-DD, today, yesterday, NdaysAgo 중 하나여야 합니다" };
  const dateRanges: { startDate: string; endDate: string; name?: string }[] = [{ startDate, endDate, name: "current" }];
  if (input.compareStartDate && input.compareEndDate) {
    if (!DATE.test(input.compareStartDate) || !DATE.test(input.compareEndDate)) return { ok: false, reason: "compareStartDate/compareEndDate 형식이 올바르지 않습니다" };
    dateRanges.push({ startDate: input.compareStartDate, endDate: input.compareEndDate, name: "previous" });
  }
  const filtered = !input.includeAll;
  const exprs: object[] = [];
  if (filtered) exprs.push(realUserFilter(brandDef.prefix));
  if (input.dimensionFilter) exprs.push(input.dimensionFilter);
  const dimensionFilter = exprs.length === 0 ? undefined : exprs.length === 1 ? exprs[0] : { andGroup: { expressions: exprs } };
  const r = await call(`${base}:runReport`, {
    dateRanges,
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    ...(dimensionFilter ? { dimensionFilter } : {}),
    ...(input.metricFilter ? { metricFilter: input.metricFilter } : {}),
    orderBys: sortDefault,
    limit,
    keepEmptyRows: false,
  });
  if (r._status >= 400) return fail(r);
  return shape(input.brand, "report", dateRanges, filtered, r, limit, filtered ? "봇·클릭팜·운영자 본인·데이터센터 도시 제외(대시보드와 같은 기준)" : "원자료(아무것도 빼지 않음)");
}

function shape(brand: BrandId, kind: string, dateRanges: object[] | undefined, filtered: boolean, r: GaResp, limit: number, note: string): Ga4QueryResult {
  const headers = [...(r.dimensionHeaders ?? []).map((h) => h.name), ...(r.metricHeaders ?? []).map((h) => h.name)];
  const rows = (r.rows ?? []).map((row) => [...(row.dimensionValues ?? []).map((v) => v.value), ...(row.metricValues ?? []).map((v) => Number(v.value))]);
  const rowCount = r.rowCount ?? rows.length;
  return { ok: true, brand, kind, dateRanges, filtered, headers, rows, rowCount, truncated: rowCount > Math.min(rows.length, limit) || rowCount > rows.length, currency: r.metadata?.currencyCode, note };
}
