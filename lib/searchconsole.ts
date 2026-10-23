// 구글 검색(Search Console) 읽기 전용 조회(scope: webmasters.readonly) + 검색으로 들어온 방문의 GA4 핵심 이벤트.
// 화면 문구는 쉬운 한국어로 쓴다(색인·canonical 같은 말 대신 '구글 검색에 나옴' 등). 토큰 값은 화면·로그에 내지 않는다.
import { googleToken, logFailure, tokenFailureReason } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { eachDay, type DateRange } from "@/lib/range";

export const SEARCH_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export type SearchDay = { date: string; clicks: number; impressions: number };
export type SearchRow = { key: string; clicks: number; impressions: number; position: number; brand?: boolean };
export type SearchPeriod = { clicks: number; impressions: number; ctr: number; position: number };
export type PageCheck = { url: string; path: string; state: "in" | "out" | "warn"; text: string; lastCrawl: string | null };
export type OrganicVisits = { sessions: number; engaged: number; events: { name: string; label: string; count: number }[] };

export type SearchSummary =
  | {
      ok: true;
      site: string; // 예: sc-domain:houscaper.xyz
      days: SearchDay[]; // 선택 기간(일별)
      cur: SearchPeriod;
      prev: SearchPeriod | null;
      queries: SearchRow[]; // 검색어(노출 순)
      brandShare: { clicks: number; impressions: number } | null; // 브랜드 이름 검색이 차지한 비율(0~1). 검색어가 없으면 null
      pages: SearchRow[]; // 검색에 보인 페이지(노출 순)
      checks: PageCheck[] | null; // 사이트맵 페이지별 '구글 검색에 나오나'. 못 읽으면 null
      checksNote: string | null;
      organic: OrganicVisits | null; // GA4 Organic Search 방문. 못 읽으면 null
      lastDate: string | null; // 검색 수치가 마지막으로 채워진 날(보통 2~3일 늦음)
    }
  | { ok: false; reason: string; reconnect: boolean };

const API = "https://www.googleapis.com/webmasters/v3";
const INSPECT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const MAX_CHECKS = 12; // URL 검사는 하루 2,000번 제한 — 6시간 캐시와 함께 넉넉히 아래로

// 브랜드 이름 검색으로 볼 말. {BRAND}_SEARCH_BRAND_TERMS(쉼표 구분)로 더할 수 있다.
const BRAND_TERMS: Record<BrandId, string[]> = {
  houscaper: ["houscaper", "housecaper", "하우스케이퍼"],
  topogenesis: ["topogenesis", "topo genesis", "토포제네시스", "토포 제네시스"],
};
export const SITE_DOMAIN: Record<BrandId, string> = { houscaper: "houscaper.xyz", topogenesis: "topogenesis.xyz" };

// GA4 핵심 이벤트 이름 → 화면 이름. 목록에 없으면 이벤트 이름 그대로 보인다.
const EVENT_LABEL: Record<string, string> = {
  sign_up: "가입",
  purchase: "결제",
  file_download: "다운로드",
  export_drawing: "도면 내보내기",
  generate_lead: "문의",
  begin_checkout: "결제 시작",
};

type ApiError = { error?: { code?: number; message?: string; status?: string; errors?: { reason?: string }[] } };

function failure(status: number, reason: string): { ok: false; reason: string; reconnect: boolean } {
  if (reason === "accessNotConfigured" || reason === "SERVICE_DISABLED")
    return { ok: false, reason: "Google Cloud에서 'Google Search Console API'가 꺼져 있습니다. OAuth 클라이언트가 속한 프로젝트에서 사용 설정을 눌러 주세요.", reconnect: false };
  if (reason === "insufficientPermissions" || reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT")
    return { ok: false, reason: "검색 데이터를 읽을 권한이 없는 토큰입니다. 아래 '구글 검색 연결하기'로 다시 받아 주세요.", reconnect: true };
  if (status === 403)
    return { ok: false, reason: "이 구글 계정은 이 사이트의 Search Console 소유자가 아닙니다. 사이트를 등록한 계정으로 다시 연결해 주세요.", reconnect: true };
  return { ok: false, reason: `구글 검색 수치를 못 읽었습니다 (${reason})`, reconnect: false };
}

async function call<T>(url: string, token: string, body?: object, revalidate = 600): Promise<{ ok: true; j: T } | { ok: false; status: number; reason: string }> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    next: { revalidate },
  });
  if (res.ok) return { ok: true, j: (await res.json()) as T };
  const e = ((await res.json().catch(() => ({}))) as ApiError).error;
  return { ok: false, status: res.status, reason: e?.errors?.[0]?.reason ?? e?.status ?? `http_${res.status}` };
}

type SaRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type SaResp = { rows?: SaRow[] };

const periodOf = (rows: SearchDay[], posRows: SaRow[]): SearchPeriod => {
  const clicks = rows.reduce((a, d) => a + d.clicks, 0);
  const impressions = rows.reduce((a, d) => a + d.impressions, 0);
  // 평균 순위는 노출로 가중 평균(Search Console 화면과 같은 방식)
  const wImp = posRows.reduce((a, r) => a + (r.impressions ?? 0), 0);
  const position = wImp ? posRows.reduce((a, r) => a + (r.position ?? 0) * (r.impressions ?? 0), 0) / wImp : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
};

const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search || "/";
  } catch {
    return u;
  }
};

// URL 검사 결과를 쉬운 말로. 영어 원문(coverageState)은 그대로 보이지 않는다.
export function plainCoverage(verdict: string | undefined, coverage: string | undefined, robots: string | undefined, indexing: string | undefined, fetchState: string | undefined): { state: PageCheck["state"]; text: string } {
  const c = (coverage ?? "").toLowerCase();
  if (verdict === "PASS" || (c.includes("indexed") && !c.includes("not indexed"))) return { state: "in", text: "구글 검색에 나와요" };
  if (indexing === "BLOCKED_BY_META_TAG" || indexing === "BLOCKED_BY_HTTP_HEADER" || c.includes("noindex")) return { state: "warn", text: "페이지에 '검색에 내지 마' 표시가 붙어 있어요 — 고쳐야 해요" };
  if (robots === "DISALLOWED" || c.includes("robots")) return { state: "warn", text: "사이트 설정이 구글을 막고 있어요 — 고쳐야 해요" };
  if (fetchState === "NOT_FOUND" || c.includes("404")) return { state: "warn", text: "페이지가 없어요(404)" };
  if (c.includes("redirect")) return { state: "out", text: "다른 주소로 넘어가는 페이지라 이 주소는 안 나와요(정상)" };
  if (c.includes("canonical") || c.includes("duplicate")) return { state: "warn", text: "구글이 다른 페이지와 같은 페이지로 보고 이 주소는 안 내보내요" };
  if (c.includes("crawled")) return { state: "out", text: "구글이 읽어 갔지만 아직 검색에 안 올렸어요" };
  if (c.includes("discovered")) return { state: "out", text: "구글이 주소는 알지만 아직 안 읽어 갔어요" };
  if (c.includes("unknown")) return { state: "out", text: "구글이 아직 이 페이지를 몰라요" };
  return { state: "out", text: "아직 검색에 안 나와요" };
}

async function sitemapUrls(domain: string): Promise<string[]> {
  for (const host of [`https://${domain}`, `https://www.${domain}`]) {
    const res = await fetch(`${host}/sitemap.xml`, { next: { revalidate: 21600 } }).catch(() => null);
    if (!res || !res.ok) continue;
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    // 사이트맵 묶음이면 첫 하위 사이트맵만 연다
    if (/<sitemapindex/i.test(xml) && locs[0]) {
      const sub = await fetch(locs[0], { next: { revalidate: 21600 } }).catch(() => null);
      if (!sub || !sub.ok) return [];
      return [...(await sub.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    }
    if (locs.length) return locs;
  }
  return [];
}

type InspectResp = {
  inspectionResult?: {
    indexStatusResult?: { verdict?: string; coverageState?: string; robotsTxtState?: string; indexingState?: string; pageFetchState?: string; lastCrawlTime?: string };
  };
};

async function pageChecks(site: string, domain: string, token: string): Promise<{ checks: PageCheck[] | null; note: string | null }> {
  const urls = await sitemapUrls(domain);
  if (!urls.length) return { checks: null, note: "사이트맵(sitemap.xml)을 못 읽어서 페이지별 확인을 건너뛰었어요." };
  // 홈과 얕은 주소부터(중요한 페이지일 가능성이 높다)
  const pick = [...new Set(urls)].sort((a, b) => pathOf(a).split("/").length - pathOf(b).split("/").length || a.length - b.length).slice(0, MAX_CHECKS);
  const results = await Promise.all(
    pick.map(async (url): Promise<PageCheck | { fail: string }> => {
      const r = await call<InspectResp>(INSPECT, token, { inspectionUrl: url, siteUrl: site, languageCode: "ko" }, 21600);
      if (!r.ok) return { fail: r.reason };
      const s = r.j.inspectionResult?.indexStatusResult ?? {};
      const p = plainCoverage(s.verdict, s.coverageState, s.robotsTxtState, s.indexingState, s.pageFetchState);
      return { url, path: pathOf(url), ...p, lastCrawl: s.lastCrawlTime ? s.lastCrawlTime.slice(0, 10) : null };
    }),
  );
  const ok = results.filter((x): x is PageCheck => "url" in x);
  const failed = results.length - ok.length;
  const order = { warn: 0, out: 1, in: 2 } as const;
  ok.sort((a, b) => order[a.state] - order[b.state] || a.path.localeCompare(b.path));
  const extra = urls.length > pick.length ? `사이트맵 ${urls.length}개 중 ${pick.length}개만 확인했어요(구글 하루 제한 때문). ` : "";
  return { checks: ok.length ? ok : null, note: extra + (failed ? `${failed}개는 확인하지 못했어요.` : "") || null };
}

// 검색으로 들어온 방문(GA4 'Organic Search')과 그 방문에서 생긴 핵심 이벤트(가입·결제 등).
async function organicVisits(brand: BrandId, range: DateRange): Promise<OrganicVisits | null> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const refresh = process.env.GA_REFRESH_TOKEN;
  const propertyId = (process.env[`${prefix}_GA4_PROPERTY_ID`] ?? "").replace(/\D/g, "");
  if (!refresh || !propertyId) return null;
  const t = await googleToken(refresh);
  if (!t.ok) return null;
  const filter = { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } } };
  const run = (body: object) =>
    call<{ rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] }>(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      t.token,
      { dateRanges: [{ startDate: range.from, endDate: range.to }], dimensionFilter: filter, ...body },
    );
  const [tot, ev] = await Promise.all([
    run({ metrics: [{ name: "sessions" }, { name: "engagedSessions" }] }),
    run({ dimensions: [{ name: "eventName" }], metrics: [{ name: "keyEvents" }], orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }], limit: 20 }),
  ]);
  if (!tot.ok) return null;
  const m = tot.j.rows?.[0]?.metricValues ?? [];
  const events = ev.ok
    ? (ev.j.rows ?? [])
        .map((r) => ({ name: r.dimensionValues?.[0]?.value ?? "", count: Number(r.metricValues?.[0]?.value ?? 0) }))
        .filter((e) => e.count > 0 && e.name)
        .map((e) => ({ ...e, label: EVENT_LABEL[e.name] ?? e.name }))
    : [];
  return { sessions: Number(m[0]?.value ?? 0), engaged: Number(m[1]?.value ?? 0), events };
}

export function searchToken(brand: BrandId): { name: string; value: string } | null {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const own = process.env[`${prefix}_SEARCH_CONSOLE_REFRESH_TOKEN`];
  if (own) return { name: `${prefix}_SEARCH_CONSOLE_REFRESH_TOKEN`, value: own };
  const shared = process.env.SEARCH_CONSOLE_REFRESH_TOKEN;
  return shared ? { name: "SEARCH_CONSOLE_REFRESH_TOKEN", value: shared } : null;
}

export async function listSites(token: string): Promise<string[] | null> {
  const r = await call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(`${API}/sites`, token);
  if (!r.ok) return null;
  return (r.j.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl);
}

// 이 브랜드의 Search Console 속성: {BRAND}_SEARCH_CONSOLE_SITE가 있으면 그 값, 없으면 도메인 속성 → 주소 속성 순으로 고른다.
export function pickSite(sites: string[], domain: string): string | null {
  const d = domain.toLowerCase();
  return sites.find((s) => s.toLowerCase() === `sc-domain:${d}`) ?? sites.find((s) => s.toLowerCase().includes(`//www.${d}`)) ?? sites.find((s) => s.toLowerCase().includes(d)) ?? null;
}

export const isBrandQuery = (q: string, terms: string[]) => {
  const x = q.toLowerCase();
  return terms.some((t) => x.includes(t));
};

export async function searchSummary(brand: BrandId, range: DateRange): Promise<SearchSummary> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const tok = searchToken(brand);
  if (!tok) return { ok: false, reason: "아직 구글 검색이 연결되지 않았어요.", reconnect: true };
  try {
    const t = await googleToken(tok.value);
    if (!t.ok) {
      logFailure("search", brand, `token ${t.error}`);
      return { ok: false, reason: tokenFailureReason(t.error, tok.name), reconnect: true };
    }
    const token = t.token;
    const domain = SITE_DOMAIN[brand];
    let site = process.env[`${prefix}_SEARCH_CONSOLE_SITE`] ?? "";
    if (!site) {
      const r = await call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(`${API}/sites`, token);
      if (!r.ok) return failure(r.status, r.reason);
      const sites = (r.j.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl);
      site = pickSite(sites, domain) ?? "";
      if (!site) return { ok: false, reason: `이 구글 계정의 Search Console에 ${domain} 사이트가 없어요. 사이트를 등록한 계정으로 다시 연결해 주세요.`, reconnect: true };
    }
    const q = (body: object) => call<SaResp>(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, token, { dataState: "all", ...body });
    const cur = { startDate: range.from, endDate: range.to };
    const [daily, posCur, posPrev, queries, pages] = await Promise.all([
      q({ startDate: range.prev.from, endDate: range.to, dimensions: ["date"], rowLimit: 500 }),
      q({ ...cur, dimensions: ["query"], rowLimit: 1000 }),
      q({ startDate: range.prev.from, endDate: range.prev.to, dimensions: ["query"], rowLimit: 1000 }),
      q({ ...cur, dimensions: ["query"], rowLimit: 25 }),
      q({ ...cur, dimensions: ["page"], rowLimit: 15 }),
    ]);
    if (!daily.ok) return failure(daily.status, daily.reason);

    const byDate = new Map((daily.j.rows ?? []).map((r) => [r.keys?.[0] ?? "", r]));
    const all: SearchDay[] = eachDay(range.prev.from, range.to).map((date) => ({ date, clicks: byDate.get(date)?.clicks ?? 0, impressions: byDate.get(date)?.impressions ?? 0 }));
    const days = all.slice(-range.days);
    const prevDays = all.slice(0, -range.days);
    const filled = [...byDate.keys()].filter((d) => d >= range.from && (byDate.get(d)?.impressions ?? 0) > 0).sort();

    const extraTerms = (process.env[`${prefix}_SEARCH_BRAND_TERMS`] ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const terms = [...BRAND_TERMS[brand], ...extraTerms];
    const toRow = (r: SaRow): SearchRow => ({ key: r.keys?.[0] ?? "", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? 0 });
    const qRows = (queries.ok ? queries.j.rows ?? [] : []).map((r) => ({ ...toRow(r), brand: isBrandQuery(r.keys?.[0] ?? "", terms) }));
    const allQ = posCur.ok ? posCur.j.rows ?? [] : [];
    const qImp = allQ.reduce((a, r) => a + (r.impressions ?? 0), 0);
    const qClk = allQ.reduce((a, r) => a + (r.clicks ?? 0), 0);
    const bImp = allQ.filter((r) => isBrandQuery(r.keys?.[0] ?? "", terms)).reduce((a, r) => a + (r.impressions ?? 0), 0);
    const bClk = allQ.filter((r) => isBrandQuery(r.keys?.[0] ?? "", terms)).reduce((a, r) => a + (r.clicks ?? 0), 0);

    const [checks, organic] = await Promise.all([
      pageChecks(site, domain, token).catch(() => ({ checks: null, note: "페이지별 확인을 못 했어요(네트워크)." })),
      organicVisits(brand, range).catch(() => null),
    ]);
    return {
      ok: true,
      site,
      days,
      cur: periodOf(days, allQ),
      prev: prevDays.length && !range.today ? periodOf(prevDays, posPrev.ok ? posPrev.j.rows ?? [] : []) : null,
      queries: qRows,
      brandShare: qImp ? { impressions: bImp / qImp, clicks: qClk ? bClk / qClk : 0 } : null,
      pages: (pages.ok ? pages.j.rows ?? [] : []).map((r) => ({ ...toRow(r), key: pathOf(r.keys?.[0] ?? "") })),
      checks: checks.checks,
      checksNote: checks.note,
      organic,
      lastDate: filled.length ? filled[filled.length - 1] : null,
    };
  } catch {
    return { ok: false, reason: "구글 검색 수치를 못 읽었습니다(네트워크)", reconnect: false };
  }
}
