// 화면(app/page.tsx)과 내보내기(app/api/export)가 같은 데이터·같은 계산을 쓰도록 한곳에서 모은다.
import { BRANDS, statusFor, type BrandId, type PlatformId, type PlatformStatus } from "@/lib/platforms";
import { youtubeSummary, type YoutubeSummary } from "@/lib/youtube";
import { metaSummary, type MetaSummary } from "@/lib/meta";
import { ga4Summary, type Ga4Summary } from "@/lib/ga4";
import { googleAdsSummary, type GoogleAdsSummary } from "@/lib/googleads";
import { revenueDays, revenueSummary, type RevenueSummary } from "@/lib/revenue";
import { vercelSummary, type VercelSummary } from "@/lib/vercel";
import { demoAds, demoGa4, demoMeta, demoOn, demoRevenue, demoRevenueDays, demoRevenueHours, demoSignups, demoVercel, demoYoutube } from "@/lib/demo";
import { buildOverview, type Overview } from "@/lib/overview";
import { buildEffect, type EffectReport } from "@/lib/effect";
import { buildActions, type ActionItem } from "@/lib/actions";
import { mergeAdsMoved, mergeMetaMoved } from "@/lib/merge";
import { buildCombo, buildHourCombo, type ComboData } from "@/lib/combo";
import { allEvents } from "@/lib/events";
import { signupsConfigured, signupSummary, type SignupSummary } from "@/lib/signups";
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
  signups: SignupSummary | null; // 신규 가입(Supabase RPC 일별 개수). 연결 안 됐으면 null. 내보내기에서는 읽지 않는다
  primary: "signups" | "orders"; // 이 브랜드의 핵심 전환(토포제네시스는 가입)
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

// 브랜드의 핵심 전환: 토포제네시스는 가입, 하우스케이퍼는 결제. env {BRAND}_PRIMARY_KPI=signups|orders 로 바꾼다.
export function primaryKpi(brand: BrandId, env: Record<string, string | undefined> = process.env): "signups" | "orders" {
  const v = (env[`${BRANDS.find((b) => b.id === brand)!.prefix}_PRIMARY_KPI`] ?? "").trim().toLowerCase();
  return v === "signups" || v === "orders" ? v : brand === "topogenesis" ? "signups" : "orders";
}

const DEMO_ON: PlatformId[] = ["meta", "youtube", "ga4", "revenue", "purchase_db", "vercel", "google_ads"];

// skip: 내보내기처럼 일부 소스만 필요할 때 불필요한 외부 호출을 건너뛴다.
export async function loadDashboard(brand: BrandId, range: DateRange, skip: { youtube?: boolean; vercel?: boolean; combo?: boolean } = {}): Promise<Dashboard> {
  const demo = demoOn();
  const statuses = statusFor(brand);
  const isOn = (id: PlatformId) => (demo ? DEMO_ON.includes(id) : statuses.find((s) => s.platform.id === id)?.connected);
  // 다른 브랜드 광고 계정에서 결제됐지만 이 브랜드 광고인 캠페인(lib/attribution.ts 규칙)을 받아 오려고 다른 브랜드의 광고도 함께 읽는다(10분 캐시).
  const others = BRANDS.filter((b) => b.id !== brand).map((b) => ({ id: b.id, st: statusFor(b.id) }));
  const otherOn = (st: PlatformStatus[], id: PlatformId) => !demo && !!st.find((s) => s.platform.id === id)?.connected;
  const [metaRaw, yt, ga, rev, adsRaw, vc, otherMeta, otherAds, revDays, signups] = await Promise.all([
    isOn("meta") ? (demo ? demoMeta(range) : metaSummary(brand, range)) : null,
    isOn("youtube") && !skip.youtube ? (demo ? demoYoutube() : youtubeSummary(brand)) : null,
    isOn("ga4") ? (demo ? demoGa4(range) : ga4Summary(brand, range)) : null,
    isOn("revenue") ? (demo ? demoRevenue(range) : revenueSummary(brand, range)) : null,
    isOn("google_ads") ? (demo ? demoAds(range) : googleAdsSummary(brand, range)) : null,
    isOn("vercel") && !skip.vercel ? (demo ? demoVercel(range) : vercelSummary(brand, range)) : null,
    Promise.all(others.map((o) => (otherOn(o.st, "meta") ? metaSummary(o.id, range) : null))),
    Promise.all(others.map((o) => (otherOn(o.st, "google_ads") ? googleAdsSummary(o.id, range) : null))),
    isOn("revenue") && !skip.combo ? (demo ? demoRevenueDays(range) : revenueDays(brand, range)) : null,
    !skip.combo && (demo || signupsConfigured(brand)) ? (demo ? demoSignups(range) : signupSummary(brand, range)) : null,
  ]);
  const primary = primaryKpi(brand);
  const meta = demo ? metaRaw : mergeMetaMoved(brand, metaRaw, otherMeta, range);
  const ads = demo ? adsRaw : mergeAdsMoved(brand, adsRaw, otherAds, range);
  const overview = buildOverview({
    meta: meta && meta.ok ? { days: meta.days, currency: meta.currency } : null,
    ads: ads && ads.ok ? { days: ads.days, currency: ads.currency } : null,
    realUsers: ga && ga.ok ? ga.real.activeUsers : null,
    botUsers: ga && ga.ok ? ga.split.suspectUsers : null,
    internalUsers: ga && ga.ok && ga.internal ? ga.internal.users : null,
    signups: signups && signups.ok ? signups.count : null,
    signupsPrev: signups && signups.ok ? signups.countPrev : null,
    primary,
    orders: rev && rev.ok ? rev.orders : null,
    days: range.days,
    today: range.today,
  });
  const effect = buildEffect({
    meta: meta && meta.ok ? { currency: meta.currency, campaigns: meta.campaigns.map((c) => ({ name: c.name, spend: c.spend, impressions: c.impressions, clicks: c.clicks, linkClicks: c.linkClicks, landingViews: c.landingViews, state: c.state, paidBy: c.paidBy })), total: sumTotals(meta.days.slice(-range.days), (d) => d.spend) } : null,
    ads: ads && ads.ok ? { currency: ads.currency, campaigns: ads.campaigns.map((c) => ({ name: c.name, spend: c.cost, impressions: c.impressions, clicks: c.clicks, state: c.state, paidBy: c.paidBy })), total: sumTotals(ads.days.slice(-range.days), (d) => d.cost) } : null,
    gaCampaigns: ga && ga.ok ? ga.campaigns : null,
    gaTruncated: ga && ga.ok ? ga.campaignsTruncated : false,
    hold: range.days <= 1 ? `${range.today ? "오늘은 하루가 끝나지 않았고" : "하루는"} 표본이 작아 효과 판정(낭비 의심·점검·효과 있음)을 보류합니다 — 숫자만 보고, 판단은 7일 이상으로 보세요.` : null,
  });
  // 겹쳐 그리는 일별 그래프: 광고비(막대) + 실사용자·클릭(선) + 결제(마커), 직전 기간 겹침, 광고 켜고 끈 날짜.
  const oneDay = range.days === 1;
  const daySum = <T,>(rows: T[], f: (r: T) => number) => rows.slice(-1).reduce((a, r) => a + f(r), 0); // 1일 보기의 하루 합계(마지막 날)
  const combo = skip.combo
    ? null
    : oneDay
      ? buildHourCombo({
          range,
          meta: meta && meta.ok ? { currency: meta.currency, hours: meta.hours, dayTotal: { spend: daySum(meta.days, (d) => d.spend), clicks: daySum(meta.days, (d) => d.clicks) } } : null,
          ads: ads && ads.ok ? { currency: ads.currency, hours: ads.hours, dayTotal: { spend: daySum(ads.days, (d) => d.cost), clicks: daySum(ads.days, (d) => d.clicks) } } : null,
          // 사용자 선: GA4 시간별 실사용자, 못 읽으면 Vercel 방문자 시간별로 대체
          users:
            ga && ga.ok && ga.hourly
              ? { rows: ga.hourly, label: "실사용자(GA4)" }
              : vc && vc.ok && vc.analytics.ok && vc.analytics.hourly
                ? { rows: vc.analytics.hourly.map((h) => ({ date: h.date, hour: h.hour, value: h.visitors })), label: "방문자(Vercel)" }
                : null,
          usersDayTotal: ga && ga.ok ? Math.round(ga.real.activeUsers) : null,
          orders: demo ? demoRevenueHours(range) : revDays && !Array.isArray(revDays) && revDays.ok ? revDays.hours : null,
          ordersDayTotal: rev && rev.ok ? rev.orders : null,
          // 가입은 일별 개수만 받을 수 있어 시간별 마커는 그리지 않고 하루 합계만 알린다.
          signups: null,
          signupsDayTotal: signups && signups.ok ? signups.days.find((d) => d.date === range.to)?.signups ?? 0 : null,
        })
      : buildCombo({
          range,
          meta: meta && meta.ok ? { currency: meta.currency, days: meta.days.map((d) => ({ date: d.date, spend: d.spend, clicks: d.clicks })) } : null,
          ads: ads && ads.ok ? { currency: ads.currency, days: ads.days.map((d) => ({ date: d.date, spend: d.cost, clicks: d.clicks })) } : null,
          users: ga && ga.ok ? ga.daily : null,
          orders: Array.isArray(revDays) ? revDays : revDays && revDays.ok ? revDays.days : null,
          signups: signups && signups.ok ? signups.days : null,
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
    meta, yt, ga, rev, ads, vc, signups, primary,
    combo, overview, effect, actions,
  };
}
