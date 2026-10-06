// 일별 그래프의 세로선: 광고를 켜고 끈 날짜(순수 함수).
// API는 '중지한 날짜'를 직접 주지 않아서, 캠페인별 일별 지출로 추정한다 — 마지막으로 지출한 날의 다음 날을 중지일로 본다.
// 정확한 날짜를 알면 env 로 직접 찍을 수 있다:
//   AD_EVENT_MARKERS="2026-10-06|hc_2610 시작|houscaper; 2026-10-03|Site to Mass 중지|topogenesis"   (브랜드 생략하면 두 브랜드 모두)
import { eachDay, type DateRange } from "@/lib/range";
import { isStopped, type CampaignState } from "@/lib/campaign-state";
import type { BrandId } from "@/lib/platforms";

export type AdEvent = { date: string; kind: "stop" | "start" | "note"; label: string; full: string; inferred: boolean };
export type CampaignSeries = { name: string; state?: CampaignState; days: { date: string; spend: number }[] };

const MAX_EVENTS = 6;
const MIN_QUIET_DAYS = 2; // 시작으로 보려면 그 전에 이만큼 지출이 없던 날이 있어야 한다(기간 첫머리에 이미 돌던 캠페인은 제외)
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

// 긴 캠페인 이름은 줄인다(전체 이름은 툴팁에).
export const shortName = (s: string, max = 16): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function deriveEvents(series: CampaignSeries[], range: DateRange): AdEvent[] {
  const window = new Set(eachDay(range.prev.from, range.to));
  const current = new Set(eachDay(range.from, range.to));
  const out: (AdEvent & { weight: number })[] = [];
  for (const s of series) {
    const days = s.days.filter((d) => window.has(d.date)).sort((a, b) => a.date.localeCompare(b.date));
    const spending = days.filter((d) => d.spend > 0);
    if (!spending.length) continue;
    const first = spending[0].date;
    const last = spending[spending.length - 1].date;
    const weight = spending.reduce((a, d) => a + d.spend, 0);
    // 중지·삭제: 지금 꺼져 있고, 마지막 지출일이 이 기간 안(마지막 날 제외)이면 다음 날이 중지일.
    if (isStopped(s.state) && current.has(last)) {
      const date = last < range.to ? nextDay(last) : range.to;
      out.push({ date, kind: "stop", label: `${shortName(s.name)} ${s.state === "removed" ? "삭제" : "중지"}`, full: `${s.name} — ${s.state === "removed" ? "삭제됨" : "중지됨"}(마지막 지출 ${last})`, inferred: true, weight });
    }
    // 시작: 기간 안에서 처음 지출이 잡혔고, 그 전에 지출 없는 날이 충분히 있었다.
    const quiet = days.filter((d) => d.date < first && d.spend === 0).length;
    if (current.has(first) && first > range.from && quiet >= MIN_QUIET_DAYS) {
      out.push({ date: first, kind: "start", label: `${shortName(s.name)} 시작`, full: `${s.name} — 첫 지출 ${first}`, inferred: true, weight });
    }
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, MAX_EVENTS).map(({ weight: _w, ...e }) => e).sort((a, b) => a.date.localeCompare(b.date));
}

// 직접 찍는 표시. 형식이 틀린 항목은 버린다. 기간 밖 날짜도 받는다(그래프에는 '기간 밖'으로 따로 적힌다).
export function manualEvents(brand: BrandId, env: Record<string, string | undefined> = process.env): AdEvent[] {
  const out: AdEvent[] = [];
  for (const part of (env.AD_EVENT_MARKERS ?? "").split(/[;\n]+/)) {
    const [date, label, b] = part.split("|").map((s) => s.trim());
    if (!date || !label || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) continue;
    if (b && b.toLowerCase() !== brand) continue;
    const kind = /시작|start|launch/i.test(label) ? "start" : /중지|삭제|종료|stop|pause/i.test(label) ? "stop" : "note";
    out.push({ date, kind, label: shortName(label, 20), full: label, inferred: false });
  }
  return out;
}

// 추정과 직접 표시를 합친다(같은 날짜·같은 라벨은 직접 표시가 이긴다).
export function allEvents(brand: BrandId, series: CampaignSeries[], range: DateRange, env: Record<string, string | undefined> = process.env): AdEvent[] {
  const manual = manualEvents(brand, env);
  const key = (e: AdEvent) => `${e.date}|${e.label}`;
  const seen = new Set(manual.map(key));
  return [...deriveEvents(series, range).filter((e) => !seen.has(key(e))), ...manual].sort((a, b) => a.date.localeCompare(b.date));
}
