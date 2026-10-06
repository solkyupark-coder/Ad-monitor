// 화면 확인용 가짜 데이터. DASHBOARD_DEMO=1 일 때만 쓰이며, 화면에 '데모 데이터'라고 표시된다. 실제 수치가 아니다.
import type { MetaCampaign, MetaSummary } from "@/lib/meta";
import type { CampaignSeries } from "@/lib/events";
import type { YoutubeSummary } from "@/lib/youtube";
import { eachDay, type DateRange } from "@/lib/range";

export const demoOn = () => process.env.DASHBOARD_DEMO === "1";

const scaleCampaign = <T extends { spend: number; impressions: number; clicks: number }>(c: T, k: number): T => ({
  ...c,
  spend: Math.round(c.spend * k),
  impressions: Math.round(c.impressions * k),
  clicks: Math.round(c.clicks * k),
});

// 직전 기간 + 조회 기간 날짜(비교용 일별 행).
const demoDays = (r: DateRange) => eachDay(r.prev.from, r.to);

// 데모: 1일 보기용 시간별 뼈대(전날 24시간 + 그날, 오늘이면 지금 시각까지).
export function demoHours(r: DateRange): { date: string; hour: number }[] {
  const last = r.today && r.nowHour !== null ? r.nowHour : 23;
  return [...Array.from({ length: 24 }, (_, h) => ({ date: r.prev.to, hour: h })), ...Array.from({ length: last + 1 }, (_, h) => ({ date: r.to, hour: h }))];
}

// 데모: 캠페인별 일별 지출. 중지된 캠페인은 기간 중간에 지출이 끊기고, 새 캠페인은 중간에 시작한다(그래프의 세로선 확인용).
function demoSeries(r: DateRange, days: { date: string; spend: number }[]): CampaignSeries[] {
  const dates = days.map((d) => d.date);
  const cut = r.prev.to ? dates.indexOf(r.to) - Math.max(2, Math.floor(r.days / 3)) : 0;
  const start = dates.indexOf(r.to) - Math.max(1, Math.floor(r.days / 4));
  const line = (name: string, state: "active" | "paused" | "removed", from: number, to: number): CampaignSeries => ({ name, state, days: dates.map((date, i) => ({ date, spend: i >= from && i <= to ? 3000 : 0 })) });
  return [line("[데모] 브랜드 인지도", "paused", 0, cut), line("[데모] 신규 고객 · 트래픽", "active", 0, dates.length), line("[데모] 새 캠페인 (hc_demo)", "active", start, dates.length)];
}

export function demoMeta(r: DateRange): MetaSummary {
  const days = demoDays(r).map((date, i) => {
    const wave = 1 + 0.35 * Math.sin(i / 2) + (i >= r.days ? 0.25 : 0);
    const spend = Math.round(4800 * wave);
    const impressions = Math.round(2100 * wave * (1 + 0.1 * Math.cos(i)));
    return {
      date,
      spend,
      impressions,
      clicks: Math.round(impressions * (0.046 + 0.006 * Math.sin(i))),
    };
  });
  return {
    ok: true,
    accountName: "데모 광고 계정",
    currency: "KRW",
    days,
    campaigns: [
      { name: "[데모] 신규 고객 · 트래픽", spend: 21000, impressions: 8200, clicks: 410, status: "ACTIVE", state: "active" as const },
      { name: "[데모] 리타겟팅 · 전환", spend: 11800, impressions: 5100, clicks: 260, status: "ACTIVE", state: "active" as const },
      { name: "[데모] 브랜드 인지도", spend: 6300, impressions: 3200, clicks: 130, status: "PAUSED", state: "paused" as const },
      { name: "[데모] 시즌 프로모션", spend: 1980, impressions: 572, clicks: 29, status: "DELETED", state: "removed" as const },
    ].map((c): MetaCampaign => scaleCampaign(c, r.days / 7)).concat([
      { ...scaleCampaign({ name: "Instagram post: [데모] 신작 공개", spend: 8800, impressions: 3400, clicks: 52 }, r.days / 7), account: "데모 인스타그램 프로모션", status: "ACTIVE", state: "active" as const, promo: true },
      { ...scaleCampaign({ name: "[데모] topoGenesis — 사이트 소개", spend: 5400, impressions: 2100, clicks: 38 }, r.days / 7), account: "데모 하우스 광고 계정", status: "CAMPAIGN_PAUSED", state: "paused" as const, paidBy: "Houscaper 계정에서 결제됨" },
    ]),
    accounts: [
      { id: "act_1000000000001", name: "데모 광고 계정", role: "main", currency: "KRW", spend: 35594, campaigns: 4, included: true, ok: true },
      { id: "act_1000000000002", name: "데모 인스타그램 프로모션", role: "discovered", currency: "KRW", spend: 8800, campaigns: 1, included: true, ok: true },
    ],
    notes: [],
    moved: [],
    series: demoSeries(r, days),
    hours: r.days === 1 ? demoHours(r).map((h) => ({ ...h, spend: Math.round(900 + 500 * Math.sin(h.hour / 3.5)), clicks: Math.round(6 + 4 * Math.sin(h.hour / 3.5)), impressions: 400 })) : null,
  };
}

export function demoYoutube(): YoutubeSummary {
  const t = ["Canal houses: design on screen", "Modern villa inspired by Villa Savoye", "Hanok house: cut it in MDF", "직접 도면을 뽑아 만들어보세요", "Stack blocks like building a house"];
  const v = [15, 112, 306, 5, 13];
  return {
    ok: true,
    channelTitle: "데모 채널",
    subscribers: 3,
    totalViews: 451,
    videoCount: 5,
    videos: t.map((title, i) => ({
      id: `d${i}`,
      title: `[데모] ${title}`,
      views: v[i],
      likes: Math.round(v[i] / 9),
      comments: Math.round(v[i] / 40),
      publishedAt: new Date(Date.UTC(2026, 8, 30 - i * 4)).toISOString(),
    })),
  };
}

// ── GA4 · 실매출 · 구글 광고 데모 (화면 확인용, 실제 수치가 아님) ──
import type { GeoRow, SourceRow } from "@/lib/traffic";
import type { GaCampaignRow } from "@/lib/effect";
import { assembleGa4, withRates, type Ga4Summary } from "@/lib/ga4";
import type { GoogleAdsSummary } from "@/lib/googleads";
import type { RevenueSummary } from "@/lib/revenue";

export function demoGa4(r: DateRange): Ga4Summary {
  const k = r.days / 7;
  const g = (country: string, city: string, u: number, s: number, avg: number, p = 0): GeoRow => ({
    country, city, activeUsers: u, sessions: s, engagementSec: avg * s, purchases: p, revenue: p * 6800,
    engagedSessions: avg < 5 ? 0 : Math.round(s * 0.55),
  });
  const geo = [
    g("United States", "Boardman", 520, 540, 0.6), g("United States", "Ashburn", 260, 270, 0.9, 3), g("South Korea", "Seoul", 140, 230, 48),
    g("South Korea", "Busan", 36, 58, 41), g("Philippines", "Manila", 44, 66, 2), g("United States", "New York", 18, 26, 33), g("Japan", "Tokyo", 12, 20, 29),
  ];
  const src: SourceRow[] = [
    { sourceMedium: "google / cpc", sessions: 160, activeUsers: 120, engagedSessions: 4, engagementSec: 160 },
    { sourceMedium: "(direct) / (none)", sessions: 420, activeUsers: 360, engagedSessions: 150, engagementSec: 14000 },
    { sourceMedium: "google / organic", sessions: 180, activeUsers: 150, engagedSessions: 90, engagementSec: 9500 },
    { sourceMedium: "instagram / social", sessions: 90, activeUsers: 82, engagedSessions: 51, engagementSec: 4300 },
    { sourceMedium: "facebook / paid", sessions: 95, activeUsers: 86, engagedSessions: 26, engagementSec: 2600 },
    { sourceMedium: "instagram / paid", sessions: 60, activeUsers: 55, engagedSessions: 41, engagementSec: 3500 },
  ];
  const camp = (campaign: string, sourceMedium: string, sessions: number, engagedSessions: number): GaCampaignRow => ({ campaign, sourceMedium, sessions, engagedSessions, engagementSec: engagedSessions * 40 });
  const campaigns: GaCampaignRow[] = [
    camp("[데모] 검색 · 브랜드", "google / cpc", 110, 4),
    camp("[데모] 신규 고객 · 트래픽", "facebook / paid", 70, 14),
    camp("[데모] 리타겟팅 · 전환", "instagram / paid", 60, 41),
    camp("[데모] 브랜드 인지도", "facebook / paid", 25, 12),
    camp("[데모] 디스플레이 · 리마케팅", "google / cpc", 24, 1),
    camp("(not set)", "google / cpc", 26, 0),
  ];
  const totals = (k: number) =>
    withRates({ activeUsers: Math.round(900 * k), sessions: Math.round(1100 * k), engagedSessions: Math.round(190 * k), engagementSec: 6800 * k, purchases: Math.round(3 * k), revenue: 20327 * k });
  const scale = (rows: GeoRow[], k: number): GeoRow[] =>
    rows.map((r) => ({ ...r, activeUsers: Math.round(r.activeUsers * k), sessions: Math.round(r.sessions * k), engagedSessions: Math.round(r.engagedSessions * k), engagementSec: r.engagementSec * k, purchases: Math.round(r.purchases * k), revenue: r.revenue * k }));
  return assembleGa4({
    currency: "KRW",
    total: totals(k),
    totalPrev: totals(k * 0.85),
    sources: src.map((x) => ({ ...x, sessions: Math.round(x.sessions * k), activeUsers: Math.round(x.activeUsers * k), engagedSessions: Math.round(x.engagedSessions * k), engagementSec: x.engagementSec * k })),
    geoCur: scale(geo, k),
    geoPrev: scale(geo, k * 0.85),
    geoTruncated: false,
    daily: demoDays(r).map((date, i) => ({ date, users: Math.round(60 + 18 * Math.sin(i / 1.9) + (i >= r.days ? 10 : 0)) })),
    hourly: r.days === 1 ? demoHours(r).map((h) => ({ ...h, value: Math.round(5 + 4 * Math.sin(h.hour / 3)) })) : null,
    blocked: { sessions: Math.round(310 * k), users: Math.round(240 * k) },
    campaigns: campaigns.map((c) => ({ ...c, sessions: Math.round(c.sessions * k), engagedSessions: Math.round(c.engagedSessions * k), engagementSec: c.engagementSec * k })),
  });
}

// 데모: 일부 날에만 결제가 있다.
export function demoRevenueDays(r: DateRange): { date: string; orders: number }[] {
  return demoDays(r).flatMap((date, i) => (i % 9 === 4 ? [{ date, orders: 1 + (i % 2) }] : []));
}

export function demoRevenueHours(r: DateRange): { date: string; hour: number; value: number }[] | null {
  return r.days === 1 ? demoHours(r).filter((h) => h.hour % 7 === 3).map((h) => ({ ...h, value: 1 })) : null;
}

export function demoRevenue(_r: DateRange): RevenueSummary {
  return { ok: true, source: "polar", currency: "USD", orders: 0, amount: 0, truncated: false };
}

export function demoAds(r: DateRange): GoogleAdsSummary {
  const days = demoDays(r).map((date, i) => {
    const wave = 1 + 0.3 * Math.sin(i / 2.2);
    return { date, clicks: Math.round(22 * wave), cost: Math.round(9000 * wave), impressions: Math.round(700 * wave) };
  });
  return {
    ok: true,
    accountName: "데모 구글 광고 계정",
    currency: "KRW",
    notes: [],
    moved: [],
    series: [],
    hours: r.days === 1 ? demoHours(r).map((h) => ({ ...h, spend: Math.round(1500 + 800 * Math.cos(h.hour / 4)), clicks: Math.round(3 + 2 * Math.cos(h.hour / 4)), impressions: 200 })) : null,
    days,
    campaigns: [
      { name: "[데모] 검색 · 브랜드", cost: 38000, clicks: 96, impressions: 2100, state: "active" as const },
      { name: "[데모] 디스플레이 · 리마케팅", cost: 17500, clicks: 41, impressions: 2600, state: "paused" as const },
      { name: "[데모] 성과 최대화", cost: 6900, clicks: 19, impressions: 480, state: "active" as const },
    ].map((c) => ({ ...c, cost: Math.round((c.cost * r.days) / 7), clicks: Math.round((c.clicks * r.days) / 7), impressions: Math.round((c.impressions * r.days) / 7) })),
  };
}

import type { VercelSummary } from "@/lib/vercel";
export function demoVercel(r: DateRange): VercelSummary {
  const days = demoDays(r).map((date, i) => {
    const visitors = Math.round(40 + 14 * Math.sin(i / 1.7) + (i >= r.days ? 8 : 0));
    return { date, visitors, pageviews: Math.round(visitors * 2.6) };
  });
  const t = (key: string, v: number) => ({ key, visitors: Math.round(v * r.days / 7), pageviews: Math.round(v * 2.4 * r.days / 7) });
  const now = Date.parse(`${r.to}T12:00:00Z`);
  return {
    ok: true,
    projectName: "데모 사이트",
    deploys: [
      { id: "d1", createdAt: new Date(now - 3 * 3600e3).toISOString(), state: "READY", message: "[데모] 가격 페이지 문구 수정" },
      { id: "d2", createdAt: new Date(now - 30 * 3600e3).toISOString(), state: "ERROR", message: "[데모] 결제 버튼 리팩터링" },
      { id: "d3", createdAt: new Date(now - 52 * 3600e3).toISOString(), state: "READY", message: "[데모] 랜딩 이미지 교체" },
    ],
    analytics: {
      ok: true,
      days,
      pages: [t("/", 210), t("/pricing", 64), t("/gallery", 41), t("/checkout", 9)],
      referrers: [t("", 150), t("instagram.com", 60), t("google.com", 44), t("facebook.com", 21)],
      countries: [t("KR", 170), t("US", 70), t("JP", 18)],
      blocked: { visitors: Math.round((96 * r.days) / 7), pageviews: Math.round((230 * r.days) / 7), hosts: ["cashlee.co", "ad2click.co"], dailyApplied: true },
      hourly: r.days === 1 ? demoHours(r).map((h) => ({ ...h, visitors: Math.round(8 + 6 * Math.sin(h.hour / 3.2)), pageviews: Math.round((8 + 6 * Math.sin(h.hour / 3.2)) * 2.4) })) : null,
    },
  };
}
