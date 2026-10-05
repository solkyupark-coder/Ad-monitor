// 구글 광고 읽기 전용 조회(Google Ads API, REST + GAQL). 토큰 값은 화면·로그에 내지 않는다.
// 개발자 토큰은 2026-09-09에 종료됐다. 접근 수준(Explorer 등)은 OAuth 클라이언트를 만든 Google Cloud 프로젝트에 붙으므로
// developer-token 헤더를 보내지 않는다(이후 메이저 버전에서는 거절될 예정).
import { googleToken, logFailure, tokenFailureReason } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { eachDay, type DateRange } from "@/lib/range";

export type AdsDay = { date: string; clicks: number; cost: number; impressions: number };
export type AdsCampaign = { name: string; clicks: number; cost: number; impressions: number };
export type GoogleAdsSummary =
  | { ok: true; accountName: string; currency: string; days: AdsDay[]; campaigns: AdsCampaign[] }
  | { ok: false; reason: string };

type AdsRow = {
  customer?: { descriptiveName?: string; currencyCode?: string };
  campaign?: { name?: string };
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

export async function googleAdsSummary(brand: BrandId, range: DateRange): Promise<GoogleAdsSummary> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const refresh = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = digits(process.env[`${prefix}_GOOGLE_ADS_CUSTOMER_ID`]);
  if (!refresh || !customerId) return { ok: false, reason: "자격증명 없음" };
  const loginId = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const version = /^v\d+$/.test(process.env.GOOGLE_ADS_API_VERSION ?? "") ? process.env.GOOGLE_ADS_API_VERSION : "v25";
  try {
    const t = await googleToken(refresh);
    if (!t.ok) {
      logFailure("google-ads", brand, `token ${t.error}`);
      return { ok: false, reason: tokenFailureReason(t.error, "GOOGLE_ADS_REFRESH_TOKEN") };
    }
    const token = t.token;
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(loginId ? { "login-customer-id": loginId } : {}),
    };
    const search = (query: string) =>
      fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
        next: { revalidate: 600 },
      });
    const [infoRes, dayRes, campRes] = await Promise.all([
      search("SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1"),
      // 날짜는 lib/range 가 형식을 검증한 YYYY-MM-DD 만 들어온다.
      search(`SELECT segments.date, metrics.clicks, metrics.cost_micros, metrics.impressions FROM customer WHERE segments.date BETWEEN '${range.prev.from}' AND '${range.to}' ORDER BY segments.date`),
      search(`SELECT campaign.name, metrics.clicks, metrics.cost_micros, metrics.impressions FROM campaign WHERE segments.date BETWEEN '${range.from}' AND '${range.to}' AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT 10`),
    ]);
    const bad = [infoRes, dayRes].find((r) => !r.ok);
    if (bad) {
      const body = (await bad.json().catch(() => ({}))) as AdsResp;
      const code = errorCode(body);
      const tag = code ?? body.error?.status ?? `HTTP ${bad.status}`;
      const detail = body.error?.details?.[0]?.errors?.[0]?.message ?? body.error?.message ?? "";
      logFailure("google-ads", brand, `customer ${customerId} ${version} ${bad.status} ${tag} ${detail}`.trim());
      if (code?.startsWith("DEVELOPER_TOKEN") || /access level|explorer|basic access/i.test(detail)) {
        return { ok: false, reason: `Cloud 프로젝트의 Google Ads API 접근 수준을 확인하세요 — OAuth 클라이언트가 속한 프로젝트에 Explorer 이상 접근이 있어야 합니다 (${tag})` };
      }
      if (code === "USER_PERMISSION_DENIED") {
        return { ok: false, reason: `토큰을 발급한 구글 계정이 고객 ID ${customerId}에 접근할 수 없습니다 — 관리자 계정을 거치면 GOOGLE_ADS_LOGIN_CUSTOMER_ID를 설정하세요 (${tag})` };
      }
      if (code === "CUSTOMER_NOT_ENABLED") return { ok: false, reason: `고객 ID ${customerId} 광고 계정이 활성 상태가 아닙니다 (${tag})` };
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
    const days = fillDays((((await dayRes.json()) as AdsResp).results ?? []).map((r) => ({ date: r.segments?.date ?? "", ...metric(r) })).filter((d) => d.date), range);
    const campaigns = campRes.ok
      ? (((await campRes.json()) as AdsResp).results ?? []).map((r) => ({ name: r.campaign?.name ?? "(이름 없음)", ...metric(r) }))
      : [];
    return { ok: true, accountName: info?.descriptiveName ?? "", currency: info?.currencyCode ?? "KRW", days, campaigns };
  } catch (e) {
    logFailure("google-ads", brand, `network ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
