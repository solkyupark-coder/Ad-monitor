// 화면(app/page.tsx)과 내보내기(app/api/export)가 같은 데이터·같은 계산을 쓰도록 한곳에서 모은다.
import { BRANDS, statusFor, type BrandId, type PlatformId, type PlatformStatus } from "@/lib/platforms";
import { youtubeSummary, type YoutubeSummary } from "@/lib/youtube";
import { metaSummary, type MetaSummary } from "@/lib/meta";
import { ga4Summary, type Ga4Summary } from "@/lib/ga4";
import { googleAdsSummary, type GoogleAdsSummary } from "@/lib/googleads";
import { revenueDays, revenueSummary, type RevenueSummary } from "@/lib/revenue";
import { vercelSummary, type VercelSummary } from "@/lib/vercel";
import { demoAds, demoGa4, demoMeta, demoOn, demoRevenue, demoRevenueDays, demoVercel, demoYoutube } from "@/lib/demo";
import { buildOverview, type Overview } from "@/lib/overview";
import { buildEffect, type EffectReport } from "@/lib/effect";
import { buildActions, type ActionItem } from "@/lib/actions";
import { mergeAdsMoved, mergeMetaMoved } from "@/lib/merge";
import { buildCombo, type ComboData } from "@/lib/combo";
import { allEvents } from "@/lib/events";
import type { DateRange } from "@/lib/range";

export type Dashboard = {
  brand: BrandId;
  brandLabel: string;
  range: DateRange;
  demo: boolean;
  statuses: PlatformStatus[];
  pending: PlatformStatus[];
  connectedCount: number;
  meta: MetaSummary | null;
  yt: YoutubeSummary | null;
  ga: Ga4Summary | null;
  rev: RevenueSummary | null;
  ads: GoogleAdsSummary | null;
  vc: VercelSummary | null;
  combo: ComboData | null; // 겹쳐 그리는 일별 그래프(한눈에 보기). 내보내기에서는 만들지 않는다
  overview: Overview;
  effect: EffectReport;
  actions: ActionItem[];
};

const sumTotals = <T extends { clicks: number; impressions: number }>(days: T[], spend: (d: T) => number) => ({
  spend: days.reduce((a, d) => a + spend(d), 0),
  clicks: days.reduce((a, d) => a + d.clicks, 0),
  impressions: days.reduce((a, d) => a + d.impressions, 0),
});

const DEMO_ON: PlatformId[] = ["meta", "youtube", "ga4", "revenue", "purchase_db", "vercel", "google_ads"];

// skip: 내보내기처럼 일부 소스만 필요할 때 불필요한 외부 호출을 건너뛴다.
export async function loadDashboard(brand: BrandId, range: DateRange, skip: { youtube?: boolean; vercel?: boolean; combo?: boolean } = {}): Promise<Dashboard> {
  const demo = demoOn();
  const statuses = statusFor(brand);
  const isOn = (id: PlatformId) => (demo ? DEMO_ON.includes(id) : statuses.find((s) => s.platform.id === id)?.connected);
  // 다른 브랜드 광고 계정에서 결제됐지만 이 브랜드 광고인 캠페인(lib/attribution.ts 규칙)을 받아 오려고 다른 브랜드의 광고도 함께 읽는다(10분 캐시).
  const others = BRANDS.filter((b) => b.id !== brand).map((b) => ({ id: b.id, st: statusFor(b.id) }));
  const otherOn = (st: PlatformStatus[], id: PlatformId) => !demo && !!st.find((s) => s.platform.id === id)?.connected;
  const [metaRaw, yt, ga, rev, adsRaw, vc, otherMeta, otherAds, revDays] = await Promise.all([
    isOn("meta") ? (demo ? demoMeta(range) : metaSummary(brand, range)) : null,
    isOn("youtube") && !skip.youtube ? (demo ? demoYoutube() : youtubeSummary(brand)) : null,
    isOn("ga4") ? (demo ? demoGa4(range) : ga4Summary(brand, range)) : null,
    isOn("revenue") ? (demo ? demoRevenue(range) : revenueSummary(brand, range)) : null,
    isOn("google_ads") ? (demo ? demoAds(range) : googleAdsSummary(brand, range)) : null,
    isOn("vercel") && !skip.vercel ? (demo ? demoVercel(range) : vercelSummary(brand, range)) : null,
    Promise.all(others.map((o) => (otherOn(o.st, "meta") ? metaSummary(o.id, range) : null))),
    Promise.all(others.map((o) => (otherOn(o.st, "google_ads") ? googleAdsSummary(o.id, range) : null))),
    isOn("revenue") && !skip.combo ? (demo ? demoRevenueDays(range) : revenueDays(brand, range)) : null,
  ]);
  const meta = demo ? metaRaw : mergeMetaMoved(brand, metaRaw, otherMeta, range);
  const ads = demo ? adsRaw : mergeAdsMoved(brand, adsRaw, otherAds, range);
  const overview = buildOverview({
    meta: meta && meta.ok ? { days: meta.days, currency: meta.currency } : null,
    ads: ads && ads.ok ? { days: ads.days, currency: ads.currency } : null,
    realUsers: ga && ga.ok ? ga.real.activeUsers : null,
    botUsers: ga && ga.ok ? ga.split.suspectUsers : null,
    orders: rev && rev.ok ? rev.orders : null,
    days: range.days,
  });
  const effect = buildEffect({
    meta: meta && meta.ok ? { currency: meta.currency, campaigns: meta.campaigns.map((c) => ({ name: c.name, spend: c.spend, impressions: c.impressions, clicks: c.clicks, state: c.state, paidBy: c.paidBy })), total: sumTotals(meta.days.slice(-range.days), (d) => d.spend) } : null,
    ads: ads && ads.ok ? { currency: ads.currency, campaigns: ads.campaigns.map((c) => ({ name: c.name, spend: c.cost, impressions: c.impressions, clicks: c.clicks, state: c.state, paidBy: c.paidBy })), total: sumTotals(ads.days.slice(-range.days), (d) => d.cost) } : null,
    gaCampaigns: ga && ga.ok ? ga.campaigns : null,
    gaTruncated: ga && ga.ok ? ga.campaignsTruncated : false,
  });
  // 겹쳐 그리는 일별 그래프: 광고비(막대) + 실사용자·클릭(선) + 결제(마커), 직전 기간 겹침, 광고 켜고 끈 날짜.
  const combo = skip.combo
    ? null
    : buildCombo({
        range,
        meta: meta && meta.ok ? { currency: meta.currency, days: meta.days.map((d) => ({ date: d.date, spend: d.spend, clicks: d.clicks })) } : null,
        ads: ads && ads.ok ? { currency: ads.currency, days: ads.days.map((d) => ({ date: d.date, spend: d.cost, clicks: d.clicks })) } : null,
        users: ga && ga.ok ? ga.daily : null,
        orders: Array.isArray(revDays) ? revDays : revDays && revDays.ok ? revDays.days : null,
        events: allEvents(brand, [...(meta && meta.ok ? meta.series : []), ...(ads && ads.ok ? ads.series : [])], range),
      });
  const pending = statuses.filter((s) => !isOn(s.platform.id));
  // 이 브랜드 자체 계정 조회가 실패했으면, 합친 결과가 정상이어도 실패 알림은 그대로 남긴다.
  const actions = buildActions({ days: range.days, meta: metaRaw && !metaRaw.ok ? metaRaw : meta, ads: adsRaw && !adsRaw.ok ? adsRaw : ads, ga, rev, vercel: vc, youtube: yt, pending: pending.map((p) => p.platform.label), verdict: overview.verdict, effect });
  return {
    brand,
    brandLabel: BRANDS.find((b) => b.id === brand)!.label,
    range,
    demo,
    statuses,
    pending,
    connectedCount: statuses.length - pending.length,
    meta, yt, ga, rev, ads, vc,
    combo, overview, effect, actions,
  };
}
