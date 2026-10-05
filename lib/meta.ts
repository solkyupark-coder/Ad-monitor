// 메타 광고 읽기 전용 조회(Marketing API insights). 토큰·ID 값은 화면·로그에 내지 않는다.
import { BRANDS, type BrandId } from "@/lib/platforms";
import { eachDay, type DateRange } from "@/lib/range";

export type MetaDay = { date: string; spend: number; impressions: number; clicks: number };
export type MetaCampaign = { name: string; spend: number; impressions: number; clicks: number };
export type MetaSummary =
  | { ok: true; accountName: string; currency: string; days: MetaDay[]; campaigns: MetaCampaign[] }
  | { ok: false; reason: string };

export type MetaTotals = { spend: number; impressions: number; clicks: number; ctr: number; cpc: number; cpm: number };

const API = "https://graph.facebook.com/v21.0";

type GraphError = { error?: { code?: number } };
type Row = { date_start?: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string };

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

export async function metaSummary(brand: BrandId, range: DateRange): Promise<MetaSummary> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const token = process.env[`${prefix}_META_ACCESS_TOKEN`];
  const rawId = process.env[`${prefix}_META_AD_ACCOUNT_ID`];
  if (!token || !rawId) return { ok: false, reason: "자격증명 없음" };
  const account = rawId.startsWith("act_") ? rawId : `act_${rawId}`;
  const headers = { authorization: `Bearer ${token}` };
  const get = (path: string) => fetch(`${API}/${account}${path}`, { headers, next: { revalidate: 600 } });
  try {
    const [infoRes, dayRes, campRes] = await Promise.all([
      get("?fields=name,currency"),
      get(`/insights?fields=spend,impressions,clicks&time_increment=1&limit=1000&time_range=${encodeURIComponent(JSON.stringify({ since: range.prev.from, until: range.to }))}`),
      get(`/insights?fields=campaign_name,spend,impressions,clicks&level=campaign&limit=50&time_range=${encodeURIComponent(JSON.stringify({ since: range.from, until: range.to }))}`),
    ]);
    const failed = [infoRes, dayRes].find((r) => !r.ok);
    if (failed) {
      const body = (await failed.json().catch(() => ({}))) as GraphError;
      if (body.error?.code === 190) return { ok: false, reason: "토큰 만료 또는 무효 — 장기 토큰을 다시 발급하세요" };
      if (body.error?.code === 10 || body.error?.code === 200) return { ok: false, reason: "권한 부족 — ads_read 권한을 확인하세요" };
      return { ok: false, reason: "조회 실패 — 광고 계정 ID와 토큰 권한을 확인하세요" };
    }
    const info = (await infoRes.json()) as { name?: string; currency?: string };
    const days = fillDays(((await dayRes.json()) as { data?: Row[] }).data ?? [], range);
    const campaigns = campRes.ok
      ? (((await campRes.json()) as { data?: Row[] }).data ?? [])
          .map((r) => ({
            name: r.campaign_name ?? "(이름 없음)",
            spend: Number(r.spend ?? 0),
            impressions: Number(r.impressions ?? 0),
            clicks: Number(r.clicks ?? 0),
          }))
          .sort((a, b) => b.spend - a.spend)
      : [];
    return { ok: true, accountName: info.name ?? "", currency: info.currency ?? "KRW", days, campaigns };
  } catch {
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
