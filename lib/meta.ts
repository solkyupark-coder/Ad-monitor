// 메타 광고 읽기 전용 조회(Marketing API insights). 토큰·ID 값은 화면·로그에 내지 않는다.
import { BRANDS, type BrandId } from "@/lib/platforms";

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

// 최근 7일과 그 앞 7일을 나눈다. 앞 구간이 비면 null.
export function weekSplit(days: MetaDay[]): { cur: MetaTotals; prev: MetaTotals | null } {
  const cur = days.slice(-7);
  const prev = days.slice(-14, -7);
  return { cur: totals(cur), prev: prev.length ? totals(prev) : null };
}

function fillDays(rows: Row[]): MetaDay[] {
  const byDate = new Map<string, MetaDay>();
  for (const r of rows) {
    if (!r.date_start) continue;
    byDate.set(r.date_start, {
      date: r.date_start,
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
    });
  }
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return [];
  const end = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  const out: MetaDay[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10);
    out.push(byDate.get(d) ?? { date: d, spend: 0, impressions: 0, clicks: 0 });
  }
  return out;
}

export async function metaSummary(brand: BrandId): Promise<MetaSummary> {
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
      get("/insights?fields=spend,impressions,clicks&date_preset=last_14d&time_increment=1&limit=31"),
      get("/insights?fields=campaign_name,spend,impressions,clicks&level=campaign&date_preset=last_7d&limit=50"),
    ]);
    const failed = [infoRes, dayRes].find((r) => !r.ok);
    if (failed) {
      const body = (await failed.json().catch(() => ({}))) as GraphError;
      if (body.error?.code === 190) return { ok: false, reason: "토큰 만료 또는 무효 — 장기 토큰을 다시 발급하세요" };
      if (body.error?.code === 10 || body.error?.code === 200) return { ok: false, reason: "권한 부족 — ads_read 권한을 확인하세요" };
      return { ok: false, reason: "조회 실패 — 광고 계정 ID와 토큰 권한을 확인하세요" };
    }
    const info = (await infoRes.json()) as { name?: string; currency?: string };
    const days = fillDays(((await dayRes.json()) as { data?: Row[] }).data ?? []);
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
