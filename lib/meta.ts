// 메타 광고 읽기 전용 조회(Marketing API insights). 토큰·ID 값은 화면·로그에 내지 않는다.
import { BRANDS, type BrandId } from "@/lib/platforms";
import { eachDay, type DateRange } from "@/lib/range";
import { decide, hostsIn, loadRules, subtractDays, type MovedAd, type Rules } from "@/lib/attribution";
import { metaState, type CampaignState } from "@/lib/campaign-state";
import type { CampaignSeries } from "@/lib/events";

export type MetaDay = { date: string; spend: number; impressions: number; clicks: number };
export type MetaCampaign = {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  account?: string; // 이 캠페인이 있는 광고 계정 이름(계정이 여러 개일 때 구분)
  status?: string; // 메타 effective_status (ACTIVE, PAUSED …)
  state?: CampaignState; // 집행 중 / 중지됨 / 삭제됨 — 캠페인·광고 상태로 정한다(부스트 포함)
  promo?: boolean; // 인스타·페이스북 프로모션(부스트)로 보이는 캠페인
  paidBy?: string; // 다른 브랜드 광고 계정에서 결제돼 이 브랜드로 옮겨 온 캠페인이면 그 표시(예: "Houscaper 계정에서 결제됨")
};
// 브랜드가 쓰는 광고 계정 하나. 인스타그램 프로모션(비즈니스 스위트)은 Ads Manager 계정과 다른 광고 계정에 생기는 경우가 많다.
export type MetaAccountRole = "main" | "extra" | "discovered";
export type MetaAccount = {
  id: string; // act_숫자 (비밀 아님)
  name: string;
  role: MetaAccountRole;
  currency: string;
  spend: number; // 선택 기간
  campaigns: number;
  included: boolean; // 합계에 넣었는지(통화가 다르면 제외)
  ok: boolean;
  reason?: string;
};
export type MetaSummary =
  | { ok: true; accountName: string; currency: string; days: MetaDay[]; campaigns: MetaCampaign[]; accounts: MetaAccount[]; notes: string[]; moved: MovedAd[]; series: CampaignSeries[] }
  | { ok: false; reason: string };

export type MetaTotals = { spend: number; impressions: number; clicks: number; ctr: number; cpc: number; cpm: number };

const API = "https://graph.facebook.com/v21.0";

type GraphError = { error?: { code?: number } };
type Row = { date_start?: string; campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string };

export function totals(days: MetaDay[]): MetaTotals {
  const spend = days.reduce((a, d) => a + d.spend, 0);
  const impressions = days.reduce((a, d) => a + d.impressions, 0);
  const clicks = days.reduce((a, d) => a + d.clicks, 0);
  return {
    spend,
    impressions,
    clicks,
    ctr: impressions ? clicks / impressions : 0,
    cpc: clicks ? spend / clicks : 0,
    cpm: impressions ? (spend / impressions) * 1000 : 0,
  };
}

// 선택 기간(마지막 n일)과 그 직전 n일을 나눈다. 앞 구간이 비면 null.
export function periodSplit(days: MetaDay[], n: number): { cur: MetaTotals; prev: MetaTotals | null } {
  const cur = days.slice(-n);
  const prev = days.slice(-2 * n, -n);
  return { cur: totals(cur), prev: prev.length ? totals(prev) : null };
}

// 지출이 없는 날은 행이 오지 않으므로 [직전 기간 시작, 기간 끝]을 0으로 채운다.
function fillDays(rows: Row[], range: DateRange): MetaDay[] {
  const byDate = new Map<string, MetaDay>();
  for (const r of rows) {
    if (!r.date_start) continue;
    byDate.set(r.date_start, { date: r.date_start, spend: Number(r.spend ?? 0), impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0) });
  }
  return eachDay(range.prev.from, range.to).map((d) => byDate.get(d) ?? { date: d, spend: 0, impressions: 0, clicks: 0 });
}

const MAX_ACCOUNTS = 10;
const digits = (v: string | undefined): string | null => {
  const d = (v ?? "").trim().replace(/^act_/, "");
  return /^\d{5,20}$/.test(d) ? d : null; // 경로에 들어가므로 숫자만 허용
};
const actList = (v: string | undefined): string[] => (v ?? "").split(/[\s,;]+/).map(digits).filter((d): d is string => d !== null).map((d) => `act_${d}`);

// 브랜드별로 설정된 광고 계정(대표 + 추가). 다른 브랜드 것과 섞이지 않게 접두사로만 읽는다.
function configuredAccounts(prefix: string): { main: string | null; extra: string[] } {
  const main = digits(process.env[`${prefix}_META_AD_ACCOUNT_ID`]);
  return { main: main ? `act_${main}` : null, extra: actList(process.env[`${prefix}_META_EXTRA_AD_ACCOUNT_IDS`]) };
}

// 인스타·페이스북 '게시물 홍보(부스트)'로 만들어진 캠페인 이름 패턴(비즈니스 스위트 기본 이름 포함).
const PROMO_NAME = /(^|[\s\[(])(instagram|facebook|ig|fb)\s*(post|reel|story)|boost|부스트|홍보|게시물 홍보|promotion/i;

type AcctOk = { ok: true; name: string; currency: string; days: MetaDay[]; campaigns: (Row & { status?: string; state?: CampaignState })[] };
type AcctResult = AcctOk | { ok: false; reason: string };

function graphReason(body: GraphError): string {
  if (body.error?.code === 190) return "토큰 만료 또는 무효 — 장기 토큰을 다시 발급하세요";
  if (body.error?.code === 10 || body.error?.code === 200) return "권한 부족 — ads_read 권한과 이 광고 계정 접근(자산 할당)을 확인하세요";
  return "조회 실패 — 광고 계정 ID와 토큰 권한을 확인하세요";
}

// 상태 조회에 쓰는 필터: 기본 조회는 삭제·보관된 캠페인/광고를 빼므로 상태를 명시해 같이 받는다.
const CAMPAIGN_STATUSES = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"];
const AD_STATUSES = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "PREAPPROVED", "DISAPPROVED", "PENDING_BILLING_INFO"];

async function fetchAccount(token: string, account: string, range: DateRange): Promise<AcctResult> {
  const headers = { authorization: `Bearer ${token}` };
  const get = (path: string) => fetch(`${API}/${account}${path}`, { headers, next: { revalidate: 600 } });
  const enc = (v: unknown) => encodeURIComponent(JSON.stringify(v));
  try {
    const [infoRes, dayRes, campRes, statusRes, adsRes] = await Promise.all([
      get("?fields=name,currency"),
      get(`/insights?fields=spend,impressions,clicks&time_increment=1&limit=1000&time_range=${enc({ since: range.prev.from, until: range.to })}`),
      get(`/insights?fields=campaign_id,campaign_name,spend,impressions,clicks&level=campaign&limit=50&time_range=${enc({ since: range.from, until: range.to })}`),
      get(`/campaigns?fields=id,effective_status,configured_status&limit=500&effective_status=${enc(CAMPAIGN_STATUSES)}`),
      get(`/ads?fields=campaign_id,effective_status&limit=500&effective_status=${enc(AD_STATUSES)}`),
    ]);
    const failed = [infoRes, dayRes].find((r) => !r.ok);
    if (failed) return { ok: false, reason: graphReason((await failed.json().catch(() => ({}))) as GraphError) };
    const info = (await infoRes.json()) as { name?: string; currency?: string };
    const days = fillDays(((await dayRes.json()) as { data?: Row[] }).data ?? [], range);
    // 상태 필터가 거절되면(드문 API 차이) 필터 없이 한 번 더 — 삭제된 캠페인만 못 볼 뿐 나머지 상태는 읽힌다.
    let statusBody = statusRes;
    if (!statusRes.ok) statusBody = await get("/campaigns?fields=id,effective_status,configured_status&limit=500");
    const status = new Map<string, { effective?: string; configured?: string }>();
    if (statusBody.ok) for (const c of ((await statusBody.json()) as { data?: { id?: string; effective_status?: string; configured_status?: string }[] }).data ?? []) if (c.id) status.set(c.id, { effective: c.effective_status, configured: c.configured_status });
    const adStatus = new Map<string, string[]>();
    if (adsRes.ok) for (const a of ((await adsRes.json()) as { data?: { campaign_id?: string; effective_status?: string }[] }).data ?? []) if (a.campaign_id && a.effective_status) adStatus.set(a.campaign_id, [...(adStatus.get(a.campaign_id) ?? []), a.effective_status]);
    const campaigns = campRes.ok
      ? (((await campRes.json()) as { data?: Row[] }).data ?? []).map((r) => {
          const st = r.campaign_id ? status.get(r.campaign_id) : undefined;
          return { ...r, status: st?.effective, state: metaState({ effective: st?.effective, configured: st?.configured, ads: r.campaign_id ? adStatus.get(r.campaign_id) : undefined }) };
        })
      : [];
    return { ok: true, name: info.name ?? "", currency: info.currency ?? "KRW", days, campaigns };
  } catch {
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}

// 캠페인 → 광고 링크 도메인들(소재의 JSON 안 URL에서 뽑는다). 필드 모양이 달라도 읽히게 문자열로 훑고, 실패해도 이름 규칙은 그대로 동작한다.
async function fetchLinkHosts(token: string, account: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  try {
    const res = await fetch(`${API}/${account}/ads?fields=campaign_id,creative{link_url,object_story_spec,asset_feed_spec}&limit=200`, { headers: { authorization: `Bearer ${token}` }, next: { revalidate: 600 } });
    if (!res.ok) return out;
    for (const ad of ((await res.json()) as { data?: { campaign_id?: string; creative?: unknown }[] }).data ?? []) {
      if (!ad.campaign_id) continue;
      const hosts = hostsIn(JSON.stringify(ad.creative ?? {}));
      if (hosts.length) out.set(ad.campaign_id, [...new Set([...(out.get(ad.campaign_id) ?? []), ...hosts])]);
    }
  } catch {
    /* 링크 규칙만 못 쓴다 */
  }
  return out;
}

// 캠페인별 일별 지출(직전 기간 시작부터 기간 끝까지). 그래프의 '켜고 끈 날짜'와 다른 브랜드로 옮길 캠페인의 일별 값에 쓴다.
// 행이 많으면 paging.next 를 따라가되(최대 6쪽) 이 API 주소(graph.facebook.com)만 따라간다. 실패하면 빈 값 — 나머지 화면은 그대로.
async function fetchCampaignDaily(token: string, account: string, ids: string[], range: DateRange): Promise<Map<string, MetaDay[]>> {
  const out = new Map<string, MetaDay[]>();
  if (!ids.length) return out;
  const rows: Row[] = [];
  try {
    const filtering = encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]));
    let url: string | undefined = `${API}/${account}/insights?fields=campaign_id,spend,impressions,clicks&level=campaign&time_increment=1&limit=500&filtering=${filtering}&time_range=${encodeURIComponent(JSON.stringify({ since: range.prev.from, until: range.to }))}`;
    for (let page = 0; page < 6 && url; page++) {
      const r: Response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, next: { revalidate: 600 } });
      if (!r.ok) break;
      const body = (await r.json()) as { data?: Row[]; paging?: { next?: string } };
      rows.push(...(body.data ?? []));
      url = body.paging?.next && body.paging.next.startsWith(`${API}/`) ? body.paging.next : undefined;
    }
  } catch {
    /* 일별을 못 읽으면 빈 값 */
  }
  for (const id of ids) out.set(id, fillDays(rows.filter((x) => x.campaign_id === id), range));
  return out;
}

// 이 계정 캠페인 중 다른 브랜드 광고로 보이는 것과 그 일별 값(daily 는 위에서 읽은 캠페인별 일별).
async function findMoved(token: string, id: string, res: AcctOk, brand: BrandId, range: DateRange, rules: Rules, daily: Map<string, MetaDay[]>): Promise<MovedAd[]> {
  const links = rules.links.length ? await fetchLinkHosts(token, id) : new Map<string, string[]>();
  const picks = res.campaigns
    .map((r) => ({ r, d: r.campaign_id ? decide(rules, brand, r.campaign_name ?? "", links.get(r.campaign_id) ?? []) : null }))
    .filter((x): x is { r: Row & { status?: string; state?: CampaignState }; d: { to: BrandId; why: string } } => !!x.d);
  return picks.map(({ r, d }) => ({
    source: "meta" as const,
    from: brand,
    to: d.to,
    account: res.name || id,
    name: r.campaign_name ?? "(이름 없음)",
    currency: res.currency,
    spend: Number(r.spend ?? 0),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    status: r.status,
    state: r.state,
    why: d.why,
    days: daily.get(r.campaign_id as string) ?? fillDays([], range),
  }));
}

// 비즈니스(포트폴리오)가 소유·대행하는 광고 계정 ID들. 인스타 프로모션 전용 계정을 ID 없이 찾는 용도(business_management 필요).
async function discoverAccounts(token: string, business: string): Promise<{ ids: string[]; failed: boolean }> {
  const headers = { authorization: `Bearer ${token}` };
  const ids: string[] = [];
  let failed = false;
  for (const edge of ["owned_ad_accounts", "client_ad_accounts"]) {
    try {
      const res = await fetch(`${API}/${business}/${edge}?fields=account_id&limit=100`, { headers, next: { revalidate: 600 } });
      if (!res.ok) {
        failed = true;
        continue;
      }
      for (const a of ((await res.json()) as { data?: { account_id?: string }[] }).data ?? []) {
        const d = digits(a.account_id);
        if (d) ids.push(`act_${d}`);
      }
    } catch {
      failed = true;
    }
  }
  return { ids, failed };
}

export async function metaSummary(brand: BrandId, range: DateRange): Promise<MetaSummary> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const token = process.env[`${prefix}_META_ACCESS_TOKEN`];
  if (!token || !process.env[`${prefix}_META_AD_ACCOUNT_ID`]) return { ok: false, reason: "자격증명 없음" };
  const { main, extra } = configuredAccounts(prefix);
  if (!main) return { ok: false, reason: `${prefix}_META_AD_ACCOUNT_ID 형식이 올바르지 않습니다(숫자 또는 act_숫자)` };
  const notes: string[] = [];

  // 다른 브랜드에 설정된 광고 계정은 이 브랜드에 섞지 않는다.
  const others = new Set(BRANDS.filter((b) => b.id !== brand).flatMap((b) => { const c = configuredAccounts(b.prefix); return [c.main, ...c.extra].filter((x): x is string => !!x); }));
  const roles = new Map<string, MetaAccountRole>([[main, "main"]]);
  for (const id of extra) if (!roles.has(id)) roles.set(id, "extra");
  const business = digits(process.env[`${prefix}_META_BUSINESS_ID`]);
  if (business) {
    const found = await discoverAccounts(token, business);
    if (found.failed) notes.push(`비즈니스 ${business}의 광고 계정 목록을 읽지 못했습니다 — 토큰에 business_management 권한이 있고 그 비즈니스에 접근할 수 있는지 확인하세요.`);
    for (const id of found.ids) if (!roles.has(id)) roles.set(id, "discovered");
  }
  for (const id of [...roles.keys()]) {
    if (id !== main && others.has(id)) {
      roles.delete(id);
      notes.push(`${id}는 다른 브랜드에 설정된 광고 계정이라 이 브랜드 합계에서 뺐습니다.`);
    }
  }
  if (others.has(main)) notes.push(`대표 광고 계정 ${main}이 다른 브랜드에도 설정돼 있어 두 브랜드 수치가 섞일 수 있습니다 — ${prefix}_META_AD_ACCOUNT_ID를 확인하세요.`);
  let ids = [...roles.keys()];
  if (ids.length > MAX_ACCOUNTS) {
    notes.push(`광고 계정이 ${ids.length}개라 앞의 ${MAX_ACCOUNTS}개만 읽었습니다.`);
    ids = ids.slice(0, MAX_ACCOUNTS);
  }

  const results = await Promise.all(ids.map((id) => fetchAccount(token, id, range)));
  const okIdx = results.map((r, i) => (r.ok ? i : -1)).filter((i) => i >= 0);
  if (!okIdx.length) {
    const first = results[0];
    return { ok: false, reason: first && !first.ok ? first.reason : "조회 실패" };
  }
  const mainRes = results[ids.indexOf(main)];
  // 기준 통화: 대표 계정의 통화. 대표 계정에 이 기간 지출이 없으면(예: 캠페인 0인 Ads Manager) 지출이 가장 큰 통화로 바꾼다.
  const spendOf = (r: AcctOk) => r.days.slice(-range.days).reduce((a, d) => a + d.spend, 0);
  let baseCurrency = mainRes?.ok ? mainRes.currency : (results[okIdx[0]] as AcctOk).currency;
  if (!mainRes?.ok || spendOf(mainRes) === 0) {
    const byCur = new Map<string, number>();
    for (const i of okIdx) { const r = results[i] as AcctOk; byCur.set(r.currency, (byCur.get(r.currency) ?? 0) + spendOf(r)); }
    const top = [...byCur.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) baseCurrency = top[0];
  }
  if (mainRes && !mainRes.ok) notes.push(`Ads Manager 대표 계정을 읽지 못했습니다: ${mainRes.reason}`);

  const accounts: MetaAccount[] = [];
  const included: { id: string; res: AcctOk }[] = [];
  results.forEach((r, i) => {
    const id = ids[i];
    const role = roles.get(id) ?? "extra";
    if (!r.ok) {
      accounts.push({ id, name: "", role, currency: "", spend: 0, campaigns: 0, included: false, ok: false, reason: r.reason });
      return;
    }
    const inc = r.currency === baseCurrency;
    if (!inc) notes.push(`${id}(${r.currency})는 통화가 달라(${baseCurrency}) 합계에 넣지 않았습니다.`);
    const rangeSpend = r.days.slice(-range.days).reduce((a, d) => a + d.spend, 0);
    accounts.push({ id, name: r.name, role, currency: r.currency, spend: rangeSpend, campaigns: r.campaigns.length, included: inc, ok: true });
    if (inc) included.push({ id, res: r });
  });

  // 다른 브랜드 광고로 보이는 캠페인(예: Houscaper 계정에서 결제한 Topogenesis 부스트)은 이 브랜드 합계에서 빼고 따로 들고 간다.
  const rules = loadRules();
  const dailyBy = await Promise.all(included.map(({ id, res }) => fetchCampaignDaily(token, id, res.campaigns.map((c) => c.campaign_id).filter((x): x is string => !!x), range)));
  const movedBy = await Promise.all(included.map(({ id, res }, i) => findMoved(token, id, res, brand, range, rules, dailyBy[i])));
  const moved = movedBy.flat();
  if (moved.length) {
    const byTo = new Map<string, number>();
    for (const m of moved) byTo.set(m.to, (byTo.get(m.to) ?? 0) + m.spend);
    notes.push(`다른 브랜드 광고로 보이는 캠페인 ${moved.length}개(${[...byTo.entries()].map(([to, v]) => `${to} ${Math.round(v).toLocaleString("ko-KR")} ${baseCurrency}`).join(", ")})를 이 브랜드 합계에서 빼 그 브랜드 화면으로 옮겼습니다.`);
  }
  included.forEach((inc, i) => {
    if (movedBy[i].length) inc.res = { ...inc.res, days: subtractDays(inc.res.days, movedBy[i].map((m) => m.days)), campaigns: inc.res.campaigns.filter((c) => !movedBy[i].some((m) => m.name === (c.campaign_name ?? "(이름 없음)"))) };
  });

  // 그래프의 '켜고 끈 날짜' 추정에 쓰는 캠페인별 일별 지출(옮겨 간 캠페인은 받는 브랜드가 가져간다).
  const series: CampaignSeries[] = included.flatMap(({ res }, i) =>
    res.campaigns.map((c) => ({ name: c.campaign_name ?? "(이름 없음)", state: c.state, days: (dailyBy[i].get(c.campaign_id as string) ?? []).map((d) => ({ date: d.date, spend: d.spend })) })),
  );

  // 같은 날짜끼리 합친다(모든 계정이 같은 날짜 목록을 가진다).
  const byDate = new Map<string, MetaDay>();
  for (const { res } of included) {
    for (const d of res.days) {
      const cur = byDate.get(d.date) ?? { date: d.date, spend: 0, impressions: 0, clicks: 0 };
      cur.spend += d.spend;
      cur.impressions += d.impressions;
      cur.clicks += d.clicks;
      byDate.set(d.date, cur);
    }
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const multi = included.length > 1;
  const campaigns: MetaCampaign[] = included
    .flatMap(({ id, res }) =>
      res.campaigns.map((r) => {
        const name = r.campaign_name ?? "(이름 없음)";
        return {
          name,
          spend: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          account: multi ? res.name || id : undefined,
          status: r.status,
          state: r.state,
          promo: roles.get(id) !== "main" || PROMO_NAME.test(name),
        };
      }),
    )
    .sort((a, b) => b.spend - a.spend);

  const anySpend = days.slice(-range.days).some((d) => d.spend > 0);
  if (!anySpend && !campaigns.length && !extra.length && !business) {
    notes.push(`이 기간 Ads Manager 계정(${main})에 광고가 없습니다. 인스타그램 프로모션(부스트)은 다른 광고 계정에 있을 수 있어요 — ${prefix}_META_BUSINESS_ID(자동 탐색) 또는 ${prefix}_META_EXTRA_AD_ACCOUNT_IDS(직접 지정)를 설정하세요.`);
  }
  return { ok: true, accountName: included.map((i) => i.res.name || i.id).join(" · "), currency: baseCurrency, days, campaigns, accounts, notes, moved, series };
}
