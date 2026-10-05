// 다른 브랜드 광고 계정에서 결제됐지만 이 브랜드 광고인 캠페인(lib/attribution.ts 가 옮긴 것)을 이 브랜드 화면에 합친다.
import type { BrandId } from "@/lib/platforms";
import { eachDay, type DateRange } from "@/lib/range";
import { addDays, type DayRow, type MovedAd } from "@/lib/attribution";
import type { MetaCampaign, MetaDay, MetaSummary } from "@/lib/meta";
import type { AdsCampaign, AdsDay, GoogleAdsSummary } from "@/lib/googleads";

const NAME: Record<BrandId, string> = { houscaper: "Houscaper", topogenesis: "Topogenesis" };
export const paidByLabel = (from: BrandId) => `${NAME[from]} 계정에서 결제됨`;

const zeroDays = (range: DateRange): DayRow[] => eachDay(range.prev.from, range.to).map((date) => ({ date, spend: 0, impressions: 0, clicks: 0 }));

// 받는 브랜드로 옮겨 온 캠페인 중, 합산할 수 있는(통화가 같은) 것과 못 하는 것을 가른다.
// 이 브랜드 자체 지출이 없으면(예: 캠페인 0인 계정) 옮겨 온 쪽 통화를 기준으로 삼는다.
function pick(moved: MovedAd[], baseCurrency: string | null, baseSpend: number): { currency: string; use: MovedAd[]; skipped: MovedAd[] } {
  let currency = baseCurrency;
  if (!currency || baseSpend === 0) {
    const byCur = new Map<string, number>();
    for (const m of moved) byCur.set(m.currency, (byCur.get(m.currency) ?? 0) + m.spend);
    currency = [...byCur.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? currency ?? "KRW";
  }
  return { currency, use: moved.filter((m) => m.currency === currency), skipped: moved.filter((m) => m.currency !== currency) };
}

export function mergeMetaMoved(view: BrandId, own: MetaSummary | null, others: (MetaSummary | null)[], range: DateRange): MetaSummary | null {
  const moved = others.flatMap((o) => (o && o.ok ? o.moved.filter((m) => m.to === view) : []));
  if (!moved.length) return own;
  const baseOk = own && own.ok ? own : null;
  const baseSpend = baseOk ? baseOk.days.slice(-range.days).reduce((a, d) => a + d.spend, 0) : 0;
  const { currency, use, skipped } = pick(moved, baseOk ? baseOk.currency : null, baseSpend);
  const keepBase = baseOk && baseOk.currency === currency;
  const baseDays: MetaDay[] = keepBase ? baseOk.days : zeroDays(range);
  const notes: string[] = [...(baseOk ? baseOk.notes : [])];
  if (own && !own.ok) notes.push(`이 브랜드 자체 광고 계정을 읽지 못했습니다: ${own.reason}`);
  if (baseOk && !keepBase) notes.push(`이 브랜드 자체 광고 계정(${baseOk.currency})은 통화가 달라 합계에 넣지 않았습니다.`);
  notes.push(`다른 브랜드 계정에서 결제된 이 브랜드 광고 ${use.length}개를 합쳤습니다.`);
  if (skipped.length) notes.push(`통화가 달라(${currency}) 합치지 못한 캠페인 ${skipped.length}개: ${skipped.map((m) => `${m.name}(${m.currency})`).join(", ")}`);
  const add: MetaCampaign[] = use.map((m) => ({ name: m.name, spend: m.spend, impressions: m.impressions, clicks: m.clicks, account: m.account, status: m.status, promo: true, paidBy: paidByLabel(m.from) }));
  const campaigns = [...(keepBase ? baseOk.campaigns : []), ...add].sort((a, b) => b.spend - a.spend);
  return {
    ok: true,
    accountName: [keepBase ? baseOk.accountName : "", ...new Set(use.map((m) => m.account))].filter(Boolean).join(" · "),
    currency,
    days: addDays(baseDays, use.map((m) => m.days)),
    campaigns,
    accounts: keepBase ? baseOk.accounts : [],
    notes,
    moved: [],
  };
}

export function mergeAdsMoved(view: BrandId, own: GoogleAdsSummary | null, others: (GoogleAdsSummary | null)[], range: DateRange): GoogleAdsSummary | null {
  const moved = others.flatMap((o) => (o && o.ok ? o.moved.filter((m) => m.to === view) : []));
  if (!moved.length) return own;
  const baseOk = own && own.ok ? own : null;
  const baseSpend = baseOk ? baseOk.days.slice(-range.days).reduce((a, d) => a + d.cost, 0) : 0;
  const { currency, use, skipped } = pick(moved, baseOk ? baseOk.currency : null, baseSpend);
  const keepBase = baseOk && baseOk.currency === currency;
  const baseDays: DayRow[] = keepBase ? baseOk.days.map((d) => ({ date: d.date, spend: d.cost, impressions: d.impressions, clicks: d.clicks })) : zeroDays(range);
  const notes: string[] = [...(baseOk ? baseOk.notes : [])];
  if (own && !own.ok) notes.push(`이 브랜드 자체 구글 광고 계정을 읽지 못했습니다: ${own.reason}`);
  if (baseOk && !keepBase) notes.push(`이 브랜드 자체 구글 광고 계정(${baseOk.currency})은 통화가 달라 합계에 넣지 않았습니다.`);
  notes.push(`다른 브랜드 계정에서 결제된 이 브랜드 광고 ${use.length}개를 합쳤습니다.`);
  if (skipped.length) notes.push(`통화가 달라(${currency}) 합치지 못한 캠페인 ${skipped.length}개: ${skipped.map((m) => `${m.name}(${m.currency})`).join(", ")}`);
  const add: AdsCampaign[] = use.map((m) => ({ name: m.name, cost: m.spend, impressions: m.impressions, clicks: m.clicks, paidBy: paidByLabel(m.from) }));
  const days: AdsDay[] = addDays(baseDays, use.map((m) => m.days)).map((d) => ({ date: d.date, cost: d.spend, impressions: d.impressions, clicks: d.clicks }));
  return {
    ok: true,
    accountName: [keepBase ? baseOk.accountName : "", ...new Set(use.map((m) => m.account))].filter(Boolean).join(" · "),
    currency,
    days,
    campaigns: [...(keepBase ? baseOk.campaigns : []), ...add].sort((a, b) => b.cost - a.cost),
    notes,
    moved: [],
  };
}
