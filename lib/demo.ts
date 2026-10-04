// 화면 확인용 가짜 데이터. DASHBOARD_DEMO=1 일 때만 쓰이며, 화면에 '데모 데이터'라고 표시된다. 실제 수치가 아니다.
import type { MetaSummary } from "@/lib/meta";
import type { YoutubeSummary } from "@/lib/youtube";

export const demoOn = () => process.env.DASHBOARD_DEMO === "1";

export function demoMeta(): MetaSummary {
  const base = new Date("2026-09-20T00:00:00Z").getTime();
  const days = Array.from({ length: 14 }, (_, i) => {
    const wave = 1 + 0.35 * Math.sin(i / 2) + (i > 6 ? 0.25 : 0);
    const spend = Math.round(4800 * wave);
    const impressions = Math.round(2100 * wave * (1 + 0.1 * Math.cos(i)));
    return {
      date: new Date(base + i * 86400000).toISOString().slice(0, 10),
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
