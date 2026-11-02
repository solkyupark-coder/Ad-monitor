// 아침 판단 보고·브랜드 프로젝트 공유용 요약(JSON). Windsor 없이 대시보드가 쓰는 공식 API 결과를 그대로 모으고,
// 보고에 필요한데 화면에는 없는 것(메타 나라별 지출·광고 계정 상태, GA4 이벤트별·나라별 횟수)만 여기서 더 읽는다.
// 토큰·계정 ID·비밀값은 넣지 않는다(집계 숫자와 이름뿐).
import { BRANDS, type BrandId } from "@/lib/platforms";
import { loadDashboard, type Dashboard } from "@/lib/dashboard";
import { searchSummary } from "@/lib/searchconsole";
import { googleToken, tokenFailureReason } from "@/lib/google";
import { parseRange, type DateRange } from "@/lib/range";

const GRAPH = "https://graph.facebook.com/v21.0";
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const prefixOf = (brand: BrandId) => BRANDS.find((b) => b.id === brand)!.prefix;
const fail = (reason: string) => ({ ok: false as const, reason });

// GA4가 자동으로 세는 이벤트는 행동 집계에서 뺀다(나머지가 사이트에서 직접 심은 행동).
const AUTO_EVENTS = new Set(["page_view", "session_start", "first_visit", "user_engagement", "scroll", "click", "form_start", "form_submit", "video_start", "video_progress", "video_complete", "view_search_results"]);

// 메타 광고 계정 상태 코드 → 쉬운 말(https://developers.facebook.com/docs/marketing-api/reference/ad-account).
const ACCOUNT_STATUS: Record<number, string> = {
  1: "정상",
  2: "비활성(DISABLED) — 광고 관리자에서 사유 확인 필요",
  3: "결제 미해결(UNSETTLED) — 결제 수단 확인 필요",
  7: "위험 검토 중(PENDING_RISK_REVIEW)",
  8: "정산 대기(PENDING_SETTLEMENT)",
  9: "유예 기간(IN_GRACE_PERIOD) — 결제 확인 필요",
  100: "종료 대기(PENDING_CLOSURE)",
  101: "종료됨(CLOSED)",
  201: "활성(ANY_ACTIVE)",
  202: "종료됨(ANY_CLOSED)",
};

export type MetaExtra =
  | { ok: true; account: { name: string; status: string; statusCode: number | null; disableReason: number | null; amountSpent: number | null; currency: string }; countries: { country: string; spend: number; clicks: number; linkClicks: number; impressions: number; cpc: number | null }[] }
  | { ok: false; reason: string };

export async function metaExtra(brand: BrandId, range: DateRange): Promise<MetaExtra> {
  const prefix = prefixOf(brand);
  const token = process.env[`${prefix}_META_ACCESS_TOKEN`];
  const id = (process.env[`${prefix}_META_AD_ACCOUNT_ID`] ?? "").trim().replace(/^act_/, "");
  if (!token || !/^\d{5,20}$/.test(id)) return fail("자격증명 없음");
  const headers = { authorization: `Bearer ${token}` };
  const tr = encodeURIComponent(JSON.stringify({ since: range.from, until: range.to }));
  try {
    const [infoRes, geoRes] = await Promise.all([
      fetch(`${GRAPH}/act_${id}?fields=name,account_status,disable_reason,amount_spent,currency`, { headers, next: { revalidate: 600 } }),
      fetch(`${GRAPH}/act_${id}/insights?fields=spend,clicks,inline_link_clicks,impressions&breakdowns=country&limit=200&time_range=${tr}`, { headers, next: { revalidate: 600 } }),
    ]);
    if (!infoRes.ok) return fail(`광고 계정 조회 실패(HTTP ${infoRes.status}) — 토큰 만료·권한을 확인하세요`);
    const info = (await infoRes.json()) as { name?: string; account_status?: number; disable_reason?: number; amount_spent?: string; currency?: string };
    const rows = geoRes.ok ? (((await geoRes.json()) as { data?: { country?: string; spend?: string; clicks?: string; inline_link_clicks?: string; impressions?: string }[] }).data ?? []) : [];
    const countries = rows
      .map((r) => {
        const spend = Number(r.spend ?? 0);
        const clicks = Number(r.clicks ?? 0);
        const linkClicks = Number(r.inline_link_clicks ?? 0);
        return { country: r.country ?? "?", spend: round(spend), clicks, linkClicks, impressions: Number(r.impressions ?? 0), cpc: linkClicks ? round(spend / linkClicks) : null };
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 20);
    const code = typeof info.account_status === "number" ? info.account_status : null;
    return {
      ok: true,
      account: {
        name: info.name ?? "",
        status: code === null ? "알 수 없음" : ACCOUNT_STATUS[code] ?? `코드 ${code}`,
        statusCode: code,
        disableReason: typeof info.disable_reason === "number" && info.disable_reason !== 0 ? info.disable_reason : null,
        // amount_spent는 통화 최소 단위(원은 그대로, 달러는 센트)로 온다.
        amountSpent: info.amount_spent !== undefined ? Number(info.amount_spent) : null,
        currency: info.currency ?? "",
      },
      countries,
    };
  } catch {
    return fail("조회 실패(네트워크)");
  }
}

export type Ga4Events =
  | { ok: true; events: { name: string; count: number; prev: number }[]; byCountry: { country: string; event: string; count: number }[]; lastDate: string | null }
  | { ok: false; reason: string };

export async function ga4Events(brand: BrandId, range: DateRange): Promise<Ga4Events> {
  const refresh = process.env.GA_REFRESH_TOKEN;
  const propertyId = (process.env[`${prefixOf(brand)}_GA4_PROPERTY_ID`] ?? "").replace(/\D/g, "");
  if (!refresh || !propertyId) return fail("자격증명 없음");
  const t = await googleToken(refresh);
  if (!t.ok) return fail(tokenFailureReason(t.error, "GA_REFRESH_TOKEN"));
  const run = (body: object) =>
    fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${t.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 600 },
    });
  type Resp = { rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] };
  try {
    const [totRes, geoRes, lastRes] = await Promise.all([
      run({ dateRanges: [{ startDate: range.from, endDate: range.to }, { startDate: range.prev.from, endDate: range.prev.to }], dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], limit: 200 }),
      run({ dateRanges: [{ startDate: range.from, endDate: range.to }], dimensions: [{ name: "country" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 1000 }),
      run({ dateRanges: [{ startDate: range.prev.from, endDate: range.to }], dimensions: [{ name: "date" }], metrics: [{ name: "eventCount" }], orderBys: [{ dimension: { dimensionName: "date" }, desc: true }], limit: 1 }),
    ]);
    if (!totRes.ok) return fail(`GA4 이벤트 조회 실패(HTTP ${totRes.status})`);
    const tot = (await totRes.json()) as Resp;
    // 날짜 범위가 둘이면 GA4가 dateRange 차원(date_range_0/1)을 덧붙인다.
    const map = new Map<string, { count: number; prev: number }>();
    for (const r of tot.rows ?? []) {
      const name = r.dimensionValues?.[0]?.value ?? "";
      const which = r.dimensionValues?.[1]?.value ?? "date_range_0";
      const v = Number(r.metricValues?.[0]?.value ?? 0);
      const e = map.get(name) ?? { count: 0, prev: 0 };
      if (which === "date_range_1") e.prev += v;
      else e.count += v;
      map.set(name, e);
    }
    const events = [...map].map(([name, e]) => ({ name, ...e })).filter((e) => !AUTO_EVENTS.has(e.name)).sort((a, b) => b.count - a.count);
    const geo = geoRes.ok ? ((await geoRes.json()) as Resp) : { rows: [] };
    const byCountry = (geo.rows ?? [])
      .map((r) => ({ country: r.dimensionValues?.[0]?.value ?? "", event: r.dimensionValues?.[1]?.value ?? "", count: Number(r.metricValues?.[0]?.value ?? 0) }))
      .filter((r) => !AUTO_EVENTS.has(r.event))
      .slice(0, 80);
    const last = lastRes.ok ? ((await lastRes.json()) as Resp).rows?.[0]?.dimensionValues?.[0]?.value ?? null : null;
    return { ok: true, events, byCountry, lastDate: last ? `${last.slice(0, 4)}-${last.slice(4, 6)}-${last.slice(6, 8)}` : null };
  } catch {
    return fail("조회 실패(네트워크)");
  }
}

const top = <T,>(xs: T[] | null | undefined, n: number) => (xs ?? []).slice(0, n);
const sumBy = <T,>(xs: T[], f: (x: T) => number) => round(xs.reduce((a, x) => a + f(x), 0));

// 화면용 큰 데이터에서 판단에 쓰는 숫자만 남긴다.
function compact(d: Dashboard) {
  const n = d.range.days;
  const meta = d.meta
    ? d.meta.ok
      ? {
          ok: true,
          currency: d.meta.currency,
          spend: sumBy(d.meta.days.slice(-n), (x) => x.spend),
          spendPrev: sumBy(d.meta.days.slice(-2 * n, -n), (x) => x.spend),
          clicks: sumBy(d.meta.days.slice(-n), (x) => x.clicks),
          impressions: sumBy(d.meta.days.slice(-n), (x) => x.impressions),
          lastSpendDate: [...d.meta.days].reverse().find((x) => x.spend > 0)?.date ?? null,
          daily: d.meta.days.slice(-n),
          campaigns: d.meta.campaigns.map((c) => ({ name: c.name, state: c.state ?? null, promo: !!c.promo, spend: round(c.spend), impressions: c.impressions, clicks: c.clicks, linkClicks: c.linkClicks ?? null, landingViews: c.landingViews ?? null, paidBy: c.paidBy ?? null })),
          placements: d.meta.placements ?? null,
          notes: d.meta.notes,
        }
      : { ok: false, reason: d.meta.reason }
    : null;
  const ads = d.ads
    ? d.ads.ok
      ? {
          ok: true,
          currency: d.ads.currency,
          spend: sumBy(d.ads.days.slice(-n), (x) => x.cost),
          spendPrev: sumBy(d.ads.days.slice(-2 * n, -n), (x) => x.cost),
          clicks: sumBy(d.ads.days.slice(-n), (x) => x.clicks),
          campaigns: d.ads.campaigns.map((c) => ({ name: c.name, state: c.state ?? null, spend: round(c.cost), impressions: c.impressions, clicks: c.clicks, paidBy: c.paidBy ?? null })),
          notes: d.ads.notes,
        }
      : { ok: false, reason: d.ads.reason }
    : null;
  const ga = d.ga
    ? d.ga.ok
      ? {
          ok: true,
          real: d.ga.real,
          realPrev: d.ga.realPrev,
          suspect: d.ga.split,
          sources: top(d.ga.sources, 15),
          countries: top(d.ga.geo, 25),
          campaigns: top(d.ga.campaigns, 25),
          blocked: d.ga.blocked,
          internal: d.ga.internal ? { sessions: d.ga.internal.sessions, users: d.ga.internal.users } : null,
        }
      : { ok: false, reason: d.ga.reason }
    : null;
  const yt = d.yt
    ? d.yt.ok
      ? {
          ok: true,
          channel: d.yt.channelTitle,
          subscribers: d.yt.subscribers,
          totalViews: d.yt.totalViews,
          analytics: d.yt.analytics && d.yt.analytics.ok
            ? { cur: d.yt.analytics.cur, prev: d.yt.analytics.prev, top: top(d.yt.analytics.top, 5), lastDate: d.yt.analytics.lastDate, sources: top(d.yt.analytics.sources, 8), searchTerms: top(d.yt.analytics.searchTerms, 10) }
            : d.yt.analytics
              ? { ok: false, reason: d.yt.analytics.reason }
              : null,
        }
      : { ok: false, reason: d.yt.reason }
    : null;
  const etsy = d.etsy
    ? d.etsy.ok
      ? { ok: true, shop: d.etsy.shopName, currency: d.etsy.currency, cur: d.etsy.cur, prev: d.etsy.prev, countries: top(d.etsy.countries, 10), topItems: top(d.etsy.topItems, 5), favorers: d.etsy.favorers }
      : { ok: false, reason: d.etsy.reason }
    : null;
  const vercel = d.vc && d.vc.ok && d.vc.analytics.ok
    ? { visitors: sumBy(d.vc.analytics.days, (x) => x.visitors), days: d.vc.analytics.days, countries: top(d.vc.analytics.countries, 10), referrers: top(d.vc.analytics.referrers, 10), lastDeploy: d.vc.deploys[0] ?? null }
    : null;
  return {
    brand: d.brand,
    label: d.brandLabel,
    demo: d.demo,
    notConnected: d.pending.map((p) => p.platform.label),
    funnel: d.overview.steps,
    verdict: d.overview.verdict,
    totalSpend: d.overview.spend,
    totalSpendPrev: d.overview.spendPrev,
    currency: d.overview.currency,
    signups: d.signups && d.signups.ok ? { count: d.signups.count, prev: d.signups.countPrev } : null,
    orders: d.rev && d.rev.ok ? d.rev : d.rev ? { ok: false, reason: d.rev.reason } : null,
    meta,
    googleAds: ads,
    ga4: ga,
    youtube: yt,
    etsy,
    vercel,
    effect: { best: d.effect.best, worst: d.effect.worst, campaigns: d.effect.campaigns, notes: d.effect.notes },
    alerts: d.actions,
  };
}

export async function brandBrief(brand: BrandId, range: DateRange) {
  const [d, metaX, events, search] = await Promise.all([
    loadDashboard(brand, range, { combo: true }),
    metaExtra(brand, range),
    ga4Events(brand, range),
    searchSummary(brand, range).catch(() => ({ ok: false as const, reason: "조회 실패", reconnect: false })),
  ]);
  const searchCompact = search.ok
    ? { ok: true, site: search.site, cur: search.cur, prev: search.prev, lastDate: search.lastDate, queries: top(search.queries, 15), pages: top(search.pages, 10), brandShare: search.brandShare, organic: search.organic }
    : { ok: false, reason: search.reason };
  return { ...compact(d), metaAccount: metaX.ok ? metaX.account : null, metaCountries: metaX.ok ? metaX.countries : null, metaExtraError: metaX.ok ? null : metaX.reason, ga4Events: events, search: searchCompact };
}

// 기본: 어제 하루와 최근 7일을 같이(아침 보고는 "어제 + 흐름"을 본다).
export async function buildBrief(opts: { brands?: BrandId[]; range?: { range?: string; from?: string; to?: string } } = {}) {
  const brands = opts.brands?.length ? opts.brands : BRANDS.map((b) => b.id);
  const yesterday = parseRange({ range: "1" });
  const week = parseRange(opts.range ?? { range: "7" });
  const out: Record<string, unknown> = {};
  await Promise.all(
    brands.map(async (b) => {
      const [y, w] = await Promise.all([brandBrief(b, yesterday), brandBrief(b, week)]);
      out[b] = { yesterday: y, period: w };
    }),
  );
  return {
    generatedAt: new Date().toISOString(),
    source: "ad-monitor 직접 연동(메타 Graph·구글 광고·GA4 Data·Search Console·YouTube Analytics·Etsy·Vercel). Windsor 미사용.",
    ranges: { yesterday: { from: yesterday.from, to: yesterday.to }, period: { from: week.from, to: week.to, days: week.days } },
    brands: out,
  };
}
