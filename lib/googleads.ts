// 구글 광고 읽기 전용 조회(Google Ads API, REST + GAQL). 토큰·ID 값은 화면·로그에 내지 않는다.
// 개발자 토큰이 승인되기 전에는 '연결 필요'/오류 문구만 보이고, 승인되면 그대로 동작한다.
import { googleAccessToken } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { yesterdayDate } from "@/lib/revenue";

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
type AdsResp = { results?: AdsRow[]; error?: { message?: string; details?: { errors?: { errorCode?: Record<string, string> }[] }[] } };

// 활동이 없는 날은 행이 오지 않으므로, 어제까지 14일을 0으로 채워 날짜 기준으로 자를 수 있게 한다.
function fillDays(rows: AdsDay[]): AdsDay[] {
  const by = new Map(rows.map((d) => [d.date, d]));
  const end = new Date(`${yesterdayDate()}T00:00:00Z`).getTime();
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date(end - (13 - i) * 86400000).toISOString().slice(0, 10);
    return by.get(date) ?? { date, clicks: 0, cost: 0, impressions: 0 };
  });
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

export async function googleAdsSummary(brand: BrandId): Promise<GoogleAdsSummary> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const refresh = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = digits(process.env[`${prefix}_GOOGLE_ADS_CUSTOMER_ID`]);
  if (!devToken || !refresh || !customerId) return { ok: false, reason: "자격증명 없음" };
  const loginId = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const version = /^v\d+$/.test(process.env.GOOGLE_ADS_API_VERSION ?? "") ? process.env.GOOGLE_ADS_API_VERSION : "v25";
  try {
    const token = await googleAccessToken(refresh);
    if (!token) return { ok: false, reason: "토큰 갱신 실패 — adwords 동의를 다시 받아 GOOGLE_ADS_REFRESH_TOKEN을 교체하세요" };
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      "developer-token": devToken,
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
      search("SELECT segments.date, metrics.clicks, metrics.cost_micros, metrics.impressions FROM customer WHERE segments.date DURING LAST_14_DAYS ORDER BY segments.date"),
      search("SELECT campaign.name, metrics.clicks, metrics.cost_micros, metrics.impressions FROM campaign WHERE segments.date DURING LAST_7_DAYS AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT 10"),
    ]);
    const bad = [infoRes, dayRes].find((r) => !r.ok);
    if (bad) {
      const code = errorCode((await bad.json().catch(() => ({}))) as AdsResp);
      if (code === "DEVELOPER_TOKEN_NOT_APPROVED") return { ok: false, reason: "개발자 토큰이 아직 승인되지 않았습니다(테스트 권한)" };
      if (code === "DEVELOPER_TOKEN_INVALID") return { ok: false, reason: "개발자 토큰이 올바르지 않습니다" };
      if (code === "USER_PERMISSION_DENIED" || code === "CUSTOMER_NOT_ENABLED") return { ok: false, reason: "계정 접근 권한이 없습니다 — 관리자 계정(GOOGLE_ADS_LOGIN_CUSTOMER_ID)과 연결을 확인하세요" };
      if (bad.status === 401) return { ok: false, reason: "토큰 거절 — GOOGLE_ADS_REFRESH_TOKEN을 다시 발급하세요" };
      if (bad.status === 404) return { ok: false, reason: "API 버전이 종료됐을 수 있습니다 — GOOGLE_ADS_API_VERSION을 확인하세요" };
      return { ok: false, reason: "조회 실패 — 고객 ID와 권한을 확인하세요" };
    }
    const info = ((await infoRes.json()) as AdsResp).results?.[0]?.customer;
    const days = fillDays((((await dayRes.json()) as AdsResp).results ?? []).map((r) => ({ date: r.segments?.date ?? "", ...metric(r) })).filter((d) => d.date));
    const campaigns = campRes.ok
      ? (((await campRes.json()) as AdsResp).results ?? []).map((r) => ({ name: r.campaign?.name ?? "(이름 없음)", ...metric(r) }))
      : [];
    return { ok: true, accountName: info?.descriptiveName ?? "", currency: info?.currencyCode ?? "KRW", days, campaigns };
  } catch {
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
