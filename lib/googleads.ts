// 구글 광고 읽기 전용 조회(Google Ads API, REST + GAQL). 토큰 값은 화면·로그에 내지 않는다.
// 개발자 토큰은 2026-09-09에 종료됐다. 접근 수준(Explorer 등)은 OAuth 클라이언트를 만든 Google Cloud 프로젝트에 붙으므로
// developer-token 헤더를 보내지 않는다(이후 메이저 버전에서는 거절될 예정).
import { googleToken, logFailure, tokenFailureReason } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { eachDay, type DateRange } from "@/lib/range";
import { decide, hostsIn, loadRules, subtractDays, type DayRow, type MovedAd } from "@/lib/attribution";

export type AdsDay = { date: string; clicks: number; cost: number; impressions: number };
export type AdsCampaign = { name: string; clicks: number; cost: number; impressions: number; paidBy?: string }; // paidBy: 다른 브랜드 계정에서 결제돼 옮겨 온 캠페인 표시
export type GoogleAdsSummary =
  | { ok: true; accountName: string; currency: string; days: AdsDay[]; campaigns: AdsCampaign[]; notes: string[]; moved: MovedAd[] }
  | { ok: false; reason: string };

type AdsRow = {
  customer?: { descriptiveName?: string; currencyCode?: string };
  campaign?: { id?: string; name?: string };
  adGroupAd?: { ad?: { finalUrls?: string[] } };
  segments?: { date?: string };
  metrics?: { clicks?: string; costMicros?: string; impressions?: string };
};
type AdsResp = {
  results?: AdsRow[];
  error?: { status?: string; message?: string; details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[] };
};

// 활동이 없는 날은 행이 오지 않으므로, [직전 기간 시작, 기간 끝]을 0으로 채워 날짜 기준으로 자를 수 있게 한다.
function fillDays(rows: AdsDay[], range: DateRange): AdsDay[] {
  const by = new Map(rows.map((d) => [d.date, d]));
  return eachDay(range.prev.from, range.to).map((date) => by.get(date) ?? { date, clicks: 0, cost: 0, impressions: 0 });
}

const digits = (s: string | undefined) => (s ?? "").replace(/\D/g, "");
const metric = (r: AdsRow) => ({
  clicks: Number(r.metrics?.clicks ?? 0),
  cost: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
  impressions: Number(r.metrics?.impressions ?? 0),
});

function errorCode(body: AdsResp): string | undefined {
  const code = body.error?.details?.[0]?.errors?.[0]?.errorCode;
  return code ? Object.values(code)[0] : undefined;
}

// 관리자(MCC) 로그인 ID. 브랜드별 {PREFIX}_GOOGLE_ADS_LOGIN_CUSTOMER_ID 가 공통 GOOGLE_ADS_LOGIN_CUSTOMER_ID 보다 우선한다.
// 관리자 계정 아래에 있지 않은(직접 접근하는) 계정이면 브랜드별 값을 none 으로 두어 헤더를 아예 보내지 않는다.
export function loginIdFor(prefix: string, env: Record<string, string | undefined> = process.env): { id: string; source: "brand" | "shared" | "none" } {
  const own = (env[`${prefix}_GOOGLE_ADS_LOGIN_CUSTOMER_ID`] ?? "").trim();
  if (own) return /^(none|off|direct|-|0)$/i.test(own) ? { id: "", source: "none" } : { id: digits(own), source: "brand" };
  const shared = digits(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  return shared ? { id: shared, source: "shared" } : { id: "", source: "none" };
}

export async function googleAdsSummary(brand: BrandId, range: DateRange): Promise<GoogleAdsSummary> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const refresh = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = digits(process.env[`${prefix}_GOOGLE_ADS_CUSTOMER_ID`]);
  if (!refresh || !customerId) return { ok: false, reason: "자격증명 없음" };
  const login = loginIdFor(prefix);
  const version = /^v\d+$/.test(process.env.GOOGLE_ADS_API_VERSION ?? "") ? process.env.GOOGLE_ADS_API_VERSION : "v25";
  try {
    const t = await googleToken(refresh);
    if (!t.ok) {
      logFailure("google-ads", brand, `token ${t.error}`);
      return { ok: false, reason: tokenFailureReason(t.error, "GOOGLE_ADS_REFRESH_TOKEN") };
    }
    const token = t.token;
    const searchWith = (loginId: string) => (query: string) =>
      fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(loginId ? { "login-customer-id": loginId } : {}) },
        body: JSON.stringify({ query }),
        next: { revalidate: 600 },
      });
    const infoQ = "SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1";
    // 날짜는 lib/range 가 형식을 검증한 YYYY-MM-DD 만 들어온다.
    const dayQ = `SELECT segments.date, metrics.clicks, metrics.cost_micros, metrics.impressions FROM customer WHERE segments.date BETWEEN '${range.prev.from}' AND '${range.to}' ORDER BY segments.date`;
    const campQ = `SELECT campaign.id, campaign.name, metrics.clicks, metrics.cost_micros, metrics.impressions FROM campaign WHERE segments.date BETWEEN '${range.from}' AND '${range.to}' AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT 50`;
    const run = (loginId: string) => {
      const search = searchWith(loginId);
      return Promise.all([search(infoQ), search(dayQ), search(campQ)]);
    };
    let usedLogin = login.id;
    let [infoRes, dayRes, campRes] = await run(usedLogin);
    const notes: string[] = [];
    // 관리자 계정을 거치라고 설정했는데 그 아래 계정이 아니면 USER_PERMISSION_DENIED 가 난다. 헤더 없이 직접 접근으로 한 번 더 시도한다.
    const denied = async (r: Response) => errorCode((await r.clone().json().catch(() => ({}))) as AdsResp) === "USER_PERMISSION_DENIED";
    if (usedLogin && [infoRes, dayRes].some((r) => !r.ok) && (await denied([infoRes, dayRes].find((r) => !r.ok)!))) {
      const retry = await run("");
      if (retry[0].ok && retry[1].ok) {
        [infoRes, dayRes, campRes] = retry;
        notes.push(`관리자(MCC) ${usedLogin}를 거치면 권한 오류가 나서, 관리자 없이 직접 접근으로 읽었습니다. 이 브랜드는 ${prefix}_GOOGLE_ADS_LOGIN_CUSTOMER_ID=none 으로 두면 재시도 없이 바로 읽습니다.`);
        usedLogin = "";
      }
    }
    const bad = [infoRes, dayRes].find((r) => !r.ok);
    if (bad) {
      const body = (await bad.json().catch(() => ({}))) as AdsResp;
      const code = errorCode(body);
      const tag = code ?? body.error?.status ?? `HTTP ${bad.status}`;
      const detail = body.error?.details?.[0]?.errors?.[0]?.message ?? body.error?.message ?? "";
      logFailure("google-ads", brand, `customer ${customerId} login ${usedLogin || "none"} ${version} ${bad.status} ${tag} ${detail}`.trim());
      if (code?.startsWith("DEVELOPER_TOKEN") || /access level|explorer|basic access/i.test(detail)) {
        return { ok: false, reason: `Cloud 프로젝트의 Google Ads API 접근 수준을 확인하세요 — OAuth 클라이언트가 속한 프로젝트에 Explorer 이상 접근이 있어야 합니다 (${tag})` };
      }
      if (code === "USER_PERMISSION_DENIED") {
        const sent = usedLogin ? `login-customer-id ${usedLogin}(${login.source === "brand" ? `${prefix}_` : "공통 "}GOOGLE_ADS_LOGIN_CUSTOMER_ID) 전송 후 헤더 없이도 시도했지만 둘 다 거절됨` : "login-customer-id 없이 직접 접근으로 시도했지만 거절됨";
        return { ok: false, reason: `토큰을 발급한 구글 계정이 고객 ID ${customerId}에 접근할 수 없습니다 — ${sent}. ① ${prefix}_GOOGLE_ADS_CUSTOMER_ID 가 이 계정의 ID(하이픈 없이 10자리)인지 ② GOOGLE_ADS_REFRESH_TOKEN 을 발급한 구글 계정이 이 고객 ID 또는 그 관리자 계정에 사용자로 초대돼 있는지 확인하세요 (${tag})` };
      }
      if (code === "CUSTOMER_NOT_ENABLED") return { ok: false, reason: `고객 ID ${customerId} 광고 계정이 활성 상태가 아닙니다 — 첫 캠페인을 제출(정지 상태 가능)하고 결제 설정을 마쳐야 합니다 (${tag})` };
      if (/SCOPE_INSUFFICIENT|insufficient.*scope/i.test(`${tag} ${detail}`)) {
        return { ok: false, reason: `GOOGLE_ADS_REFRESH_TOKEN에 adwords 범위가 없습니다 — 그 범위로 다시 발급하세요 (${tag})` };
      }
      if (/has not been used|is disabled|SERVICE_DISABLED/i.test(detail)) {
        return { ok: false, reason: `Cloud 프로젝트에서 Google Ads API를 사용 설정하세요 (${tag})` };
      }
      if (bad.status === 401) return { ok: false, reason: `토큰 거절 — GOOGLE_ADS_REFRESH_TOKEN을 다시 발급하세요 (${tag})` };
      if (bad.status === 404) return { ok: false, reason: `API 버전 ${version}이 없거나 종료됐을 수 있습니다 — GOOGLE_ADS_API_VERSION을 확인하세요 (${tag})` };
      return { ok: false, reason: `조회 실패 — 고객 ID ${customerId}와 권한을 확인하세요 (${tag})` };
    }
    const info = ((await infoRes.json()) as AdsResp).results?.[0]?.customer;
    const currency = info?.currencyCode ?? "KRW";
    let days = fillDays((((await dayRes.json()) as AdsResp).results ?? []).map((r) => ({ date: r.segments?.date ?? "", ...metric(r) })).filter((d) => d.date), range);
    let campaigns: (AdsCampaign & { id?: string })[] = [];
    if (campRes.ok) {
      campaigns = (((await campRes.json()) as AdsResp).results ?? []).map((r) => ({ id: digits(r.campaign?.id) || undefined, name: r.campaign?.name ?? "(이름 없음)", ...metric(r) }));
    } else {
      // 캠페인 목록 실패는 합계(일별)에는 영향이 없어 숨기지 않고 드러낸다 — 효과 판정·캠페인 표만 비게 된다.
      const body = (await campRes.json().catch(() => ({}))) as AdsResp;
      const tag = errorCode(body) ?? body.error?.status ?? `HTTP ${campRes.status}`;
      logFailure("google-ads", brand, `campaign query customer ${customerId} ${campRes.status} ${tag}`);
      notes.push(`캠페인 목록을 읽지 못했습니다(${tag}) — 합계는 맞지만 캠페인별 표·광고 효과 판정이 비어 있을 수 있습니다.`);
    }

    // 다른 브랜드 광고로 보이는 캠페인(예: Houscaper 계정에서 결제한 Topogenesis 캠페인)은 이 브랜드 합계에서 빼 그 브랜드 화면으로 옮긴다.
    const search = searchWith(usedLogin);
    const rules = loadRules();
    const linkHosts = new Map<string, string[]>();
    if (rules.links.length && campaigns.length) {
      try {
        const r = await search(`SELECT campaign.id, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE campaign.id IN (${campaigns.filter((c) => c.id).map((c) => c.id).join(",") || "0"}) LIMIT 500`);
        if (r.ok) for (const row of ((await r.json()) as AdsResp).results ?? []) {
          const id = digits(row.campaign?.id);
          if (id) linkHosts.set(id, [...new Set([...(linkHosts.get(id) ?? []), ...hostsIn((row.adGroupAd?.ad?.finalUrls ?? []).join(" "))])]);
        }
      } catch {
        /* 링크 규칙만 못 쓴다 */
      }
    }
    const picks = campaigns.map((c) => ({ c, d: decide(rules, brand, c.name, c.id ? linkHosts.get(c.id) ?? [] : []) })).filter((x): x is { c: AdsCampaign & { id?: string }; d: { to: BrandId; why: string } } => !!x.d);
    const moved: MovedAd[] = [];
    if (picks.length) {
      const dailyById = new Map<string, DayRow[]>();
      const ids = picks.map((x) => x.c.id).filter((x): x is string => !!x);
      if (ids.length) {
        try {
          const r = await search(`SELECT campaign.id, segments.date, metrics.clicks, metrics.cost_micros, metrics.impressions FROM campaign WHERE campaign.id IN (${ids.join(",")}) AND segments.date BETWEEN '${range.prev.from}' AND '${range.to}'`);
          if (r.ok) {
            const rows = ((await r.json()) as AdsResp).results ?? [];
            for (const id of ids) {
              const by = new Map<string, DayRow>();
              for (const row of rows) if (digits(row.campaign?.id) === id && row.segments?.date) { const m = metric(row); by.set(row.segments.date, { date: row.segments.date, spend: m.cost, impressions: m.impressions, clicks: m.clicks }); }
              dailyById.set(id, eachDay(range.prev.from, range.to).map((date) => by.get(date) ?? { date, spend: 0, impressions: 0, clicks: 0 }));
            }
          }
        } catch {
          /* 일별을 못 읽으면 캠페인 합계만 옮긴다 */
        }
      }
      for (const { c, d } of picks) {
        moved.push({ source: "google", from: brand, to: d.to, account: info?.descriptiveName || `고객 ${customerId}`, name: c.name, currency, spend: c.cost, impressions: c.impressions, clicks: c.clicks, why: d.why, days: (c.id && dailyById.get(c.id)) || eachDay(range.prev.from, range.to).map((date) => ({ date, spend: 0, impressions: 0, clicks: 0 })) });
      }
      const gone = new Set(picks.map((x) => x.c));
      campaigns = campaigns.filter((c) => !gone.has(c));
      const hasDaily = moved.filter((m) => m.days.some((d) => d.spend > 0));
      days = subtractDays(days.map((d) => ({ date: d.date, spend: d.cost, impressions: d.impressions, clicks: d.clicks })), hasDaily.map((m) => m.days)).map((d) => ({ date: d.date, cost: d.spend, impressions: d.impressions, clicks: d.clicks }));
      notes.push(`다른 브랜드 광고로 보이는 캠페인 ${moved.length}개(${moved.map((m) => `${m.name} → ${m.to}`).join(", ")})를 이 브랜드 합계에서 빼 그 브랜드 화면으로 옮겼습니다.`);
    }
    return { ok: true, accountName: info?.descriptiveName ?? "", currency, days, campaigns: campaigns.map(({ id: _id, ...c }) => c), notes, moved };
  } catch (e) {
    logFailure("google-ads", brand, `network ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
