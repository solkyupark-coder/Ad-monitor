// 화면 확인용 가짜 데이터. DASHBOARD_DEMO=1 일 때만 쓰이며, 화면에 '데모 데이터'라고 표시된다. 실제 수치가 아니다.
import type { MetaSummary } from "@/lib/meta";
import type { YoutubeSummary } from "@/lib/youtube";
import { eachDay, type DateRange } from "@/lib/range";

export const demoOn = () => process.env.DASHBOARD_DEMO === "1";

// 직전 기간 + 조회 기간 날짜(비교용 일별 행).
const demoDays = (r: DateRange) => eachDay(r.prev.from, r.to);

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
      { name: "[데모] 신규 고객 · 트래픽", spend: 21000, impressions: 8200, clicks: 410 },
      { name: "[데모] 리타겟팅 · 전환", spend: 11800, impressions: 5100, clicks: 260 },
      { name: "[데모] 브랜드 인지도", spend: 6300, impressions: 3200, clicks: 130 },
      { name: "[데모] 시즌 프로모션", spend: 1980, impressions: 572, clicks: 29 },
    ],
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
    { sourceMedium: "facebook / paid", sessions: 70, activeUsers: 64, engagedSessions: 30, engagementSec: 2600 },
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
  });
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
    days,
    campaigns: [
      { name: "[데모] 검색 · 브랜드", cost: 38000, clicks: 96, impressions: 2100 },
      { name: "[데모] 디스플레이 · 리마케팅", cost: 17500, clicks: 41, impressions: 2600 },
      { name: "[데모] 성과 최대화", cost: 6900, clicks: 19, impressions: 480 },
    ],
  };
}
