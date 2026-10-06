// 다른 브랜드 광고 계정에서 결제됐지만 이 브랜드 광고인 캠페인(lib/attribution.ts 가 옮긴 것)을 이 브랜드 화면에 합친다.
import type { BrandId } from "@/lib/platforms";
import { eachDay, type DateRange } from "@/lib/range";
import { addDays, type DayRow, type MovedAd } from "@/lib/attribution";
import type { MetaCampaign, MetaDay, MetaSummary } from "@/lib/meta";
import type { AdsCampaign, AdsDay, GoogleAdsSummary } from "@/lib/googleads";
import type { CampaignSeries } from "@/lib/events";
import { addHours, type AdHour } from "@/lib/hourly";
import { fxRates, ratio } from "@/lib/fx";

const NAME: Record<BrandId, string> = { houscaper: "Houscaper", topogenesis: "Topogenesis" };
export const paidByLabel = (from: BrandId) => `${NAME[from]} 계정에서 결제됨`;

// 옮겨 온 캠페인도 받는 브랜드 그래프의 '켜고 끈 날짜' 계산에 들어간다.
const movedSeries = (use: MovedAd[]): CampaignSeries[] => use.map((m) => ({ name: m.name, state: m.state, days: m.days.map((d) => ({ date: d.date, spend: d.spend })) }));

// 1일 보기 시간별: 자체 시간별에 옮겨 온 캠페인의 시간별을 더한다. 자체 소스가 없어도(일 합계만 있어도) 옮겨 온 쪽 시간별만으로 만든다. 읽지 못한 게 있으면 null.
function mergeHours(base: AdHour[] | null, hasBase: boolean, use: MovedAd[], range: DateRange): AdHour[] | null {
  if (range.days !== 1) return null;
  if (hasBase && base === null) return null; // 자체 계정의 시간별을 못 읽었으면 옮겨 온 것만 보여 줘 합계가 작아지지 않게 한다
  if (use.some((m) => !m.hours)) return null;
  return addHours(base ?? [], use.map((m) => m.hours ?? []));
}

const zeroDays = (range: DateRange): DayRow[] => eachDay(range.prev.from, range.to).map((date) => ({ date, spend: 0, impressions: 0, clicks: 0 }));

const fmtOrig = (v: number, c: string) => (c === "KRW" ? `${Math.round(v).toLocaleString("ko-KR")}원` : `${v.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} ${c}`);

// 옮겨 온 캠페인을 받는 쪽 통화로 환산한다(고정 환율). 일별·시간별 값도 함께. 원통화 금액은 orig 에 남긴다.
function convertMoved(m: MovedAd, to: string, r: number): MovedAd {
  if (r === 1) return m;
  return { ...m, currency: to, spend: m.spend * r, days: m.days.map((d) => ({ ...d, spend: d.spend * r })), hours: m.hours?.map((h) => ({ ...h, spend: h.spend * r })), orig: `원통화 ${fmtOrig(m.spend, m.currency)}` };
}

// 받는 브랜드로 옮겨 온 캠페인 중, 합산할 수 있는 것과 못 하는 것을 가른다. 이 브랜드 자체 지출이 없으면(예: 캠페인 0인 계정) 옮겨 온 쪽 통화를 기준으로 삼는다.
// 통화가 다르면 환율(고정·env)을 알 때 받는 쪽 통화로 환산해 합친다. 지출 0인 캠페인은 통화와 상관없이 합쳐도 값이 변하지 않는다.
function pick(moved: MovedAd[], baseCurrency: string | null, baseSpend: number): { currency: string; use: MovedAd[]; skipped: MovedAd[]; converted: string[] } {
  let currency = baseCurrency;
  if (!currency || baseSpend === 0) {
    const byCur = new Map<string, number>();
    for (const m of moved) byCur.set(m.currency, (byCur.get(m.currency) ?? 0) + m.spend);
    currency = [...byCur.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? currency ?? "KRW";
  }
  const rates = fxRates();
  const use: MovedAd[] = [];
  const skipped: MovedAd[] = [];
  const converted = new Set<string>();
  for (const m of moved) {
    const r = ratio(m.currency, currency, rates);
    if (r === null) { skipped.push(m); continue; }
    if (r !== 1) converted.add(m.currency);
    use.push(convertMoved(m, currency, r));
  }
  return { currency, use, skipped, converted: [...converted] };
}

const convNote = (from: string[], to: string) => `통화가 달라 ${from.join(", ")} → ${to}로 환산해 합쳤습니다(고정 환율 ${from.map((c) => `1 ${c} = ${fxRates()[c]?.toLocaleString("ko-KR")}원`).join(", ")} 기준, env FX_USD_KRW·FX_RATES로 바꿈) — 캠페인 표에 원통화 금액을 같이 적었습니다.`;

export function mergeMetaMoved(view: BrandId, own: MetaSummary | null, others: (MetaSummary | null)[], range: DateRange): MetaSummary | null {
  const moved = others.flatMap((o) => (o && o.ok ? o.moved.filter((m) => m.to === view) : []));
  if (!moved.length) return own;
  const baseOk = own && own.ok ? own : null;
  const baseSpend = baseOk ? baseOk.days.slice(-range.days).reduce((a, d) => a + d.spend, 0) : 0;
  const { currency, use, skipped, converted } = pick(moved, baseOk ? baseOk.currency : null, baseSpend);
  const keepBase = baseOk && baseOk.currency === currency;
  const baseDays: MetaDay[] = keepBase ? baseOk.days : zeroDays(range);
  const notes: string[] = [...(baseOk ? baseOk.notes : [])];
  if (own && !own.ok) notes.push(`이 브랜드 자체 광고 계정을 읽지 못했습니다: ${own.reason}`);
  if (baseOk && !keepBase && baseSpend > 0) notes.push(`이 브랜드 자체 광고 계정(${baseOk.currency})은 통화가 달라 합계에 넣지 않았습니다.`);
  notes.push(`다른 브랜드 계정에서 결제된 이 브랜드 광고 ${use.length}개를 합쳤습니다.`);
  if (converted.length) notes.push(convNote(converted, currency));
  if (skipped.length) notes.push(`통화가 달라(${currency}) 환율을 몰라 합치지 못한 캠페인 ${skipped.length}개: ${skipped.map((m) => `${m.name}(${m.currency})`).join(", ")} — FX_RATES로 환율을 추가하세요.`);
  const add: MetaCampaign[] = use.map((m) => ({ name: m.name, spend: m.spend, impressions: m.impressions, clicks: m.clicks, account: m.account, status: m.status, state: m.state, promo: true, paidBy: paidByLabel(m.from), orig: m.orig }));
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
    series: [...(keepBase ? baseOk.series : []), ...movedSeries(use)],
    hours: mergeHours(keepBase ? baseOk.hours : null, !!keepBase, use, range),
  };
}

export function mergeAdsMoved(view: BrandId, own: GoogleAdsSummary | null, others: (GoogleAdsSummary | null)[], range: DateRange): GoogleAdsSummary | null {
  const moved = others.flatMap((o) => (o && o.ok ? o.moved.filter((m) => m.to === view) : []));
  if (!moved.length) return own;
  const baseOk = own && own.ok ? own : null;
  const baseSpend = baseOk ? baseOk.days.slice(-range.days).reduce((a, d) => a + d.cost, 0) : 0;
  const { currency, use, skipped, converted } = pick(moved, baseOk ? baseOk.currency : null, baseSpend);
  const keepBase = baseOk && baseOk.currency === currency;
  const baseDays: DayRow[] = keepBase ? baseOk.days.map((d) => ({ date: d.date, spend: d.cost, impressions: d.impressions, clicks: d.clicks })) : zeroDays(range);
  const notes: string[] = [...(baseOk ? baseOk.notes : [])];
  if (own && !own.ok) notes.push(`이 브랜드 자체 구글 광고 계정을 읽지 못했습니다: ${own.reason}`);
  if (baseOk && !keepBase && baseSpend > 0) notes.push(`이 브랜드 자체 구글 광고 계정(${baseOk.currency})은 통화가 달라 합계에 넣지 않았습니다.`);
  notes.push(`다른 브랜드 계정에서 결제된 이 브랜드 광고 ${use.length}개를 합쳤습니다.`);
  if (converted.length) notes.push(convNote(converted, currency));
  if (skipped.length) notes.push(`통화가 달라(${currency}) 환율을 몰라 합치지 못한 캠페인 ${skipped.length}개: ${skipped.map((m) => `${m.name}(${m.currency})`).join(", ")} — FX_RATES로 환율을 추가하세요.`);
  const add: AdsCampaign[] = use.map((m) => ({ name: m.name, cost: m.spend, impressions: m.impressions, clicks: m.clicks, state: m.state, paidBy: paidByLabel(m.from), orig: m.orig }));
  const days: AdsDay[] = addDays(baseDays, use.map((m) => m.days)).map((d) => ({ date: d.date, cost: d.spend, impressions: d.impressions, clicks: d.clicks }));
  return {
    ok: true,
    accountName: [keepBase ? baseOk.accountName : "", ...new Set(use.map((m) => m.account))].filter(Boolean).join(" · "),
    currency,
    days,
    campaigns: [...(keepBase ? baseOk.campaigns : []), ...add].sort((a, b) => b.cost - a.cost),
    notes,
    moved: [],
    series: [...(keepBase ? baseOk.series : []), ...movedSeries(use)],
    hours: mergeHours(keepBase ? baseOk.hours : null, !!keepBase, use, range),
  };
}
