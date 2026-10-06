// 광고비 귀속 재분류: 한 브랜드의 광고 계정에서 결제됐지만 다른 브랜드 광고인 캠페인을, 그 브랜드 화면으로 옮긴다.
// 예) Houscaper 계정에서 집행한 Topogenesis 인스타 부스트 → Topogenesis 화면에 보이고 Houscaper 합계에서는 뺀다.
// 기본 규칙: 캠페인/광고 이름에 "topo"(대소문자 무시)가 있거나, 링크 도메인이 topogenesis.xyz 이면 Topogenesis.
// env 로 규칙·예외를 코드 수정 없이 늘린다(순수 함수만 — 테스트하기 쉽게 외부 import 는 타입뿐):
//   AD_REASSIGN_RULES="Same site=>topogenesis; 대지 경계=>topogenesis"   이름에 패턴(대소문자 무시)이 있으면 그 브랜드로
//   AD_REASSIGN_LINK_HOSTS="topogenesis.xyz=>topogenesis"              광고 링크 도메인(하위 도메인 포함)이 이거면 그 브랜드로(기본값 포함)
//   AD_REASSIGN_EXCEPT="topography; topo-house"                       이름에 이게 있으면 옮기지 않는다(예외)
//   AD_REASSIGN_DEFAULTS=off                                          기본 규칙(topo, topogenesis.xyz)을 끈다
import type { BrandId } from "@/lib/platforms";
import type { CampaignState } from "@/lib/campaign-state";

export type DayRow = { date: string; spend: number; impressions: number; clicks: number };
export type NameRule = { pattern: string; to: BrandId };
export type LinkRule = { host: string; to: BrandId };
export type Rules = { names: NameRule[]; links: LinkRule[]; except: string[] };

// 다른 브랜드 화면으로 옮겨진 캠페인 하나(소스 요약이 들고 있다가, 받는 브랜드 화면에서 합친다).
export type MovedAd = {
  source: "meta" | "google";
  from: BrandId; // 결제된(광고 계정이 있는) 브랜드
  to: BrandId; // 실제로 광고한 브랜드
  account: string; // 광고 계정 이름 또는 ID
  name: string;
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  status?: string;
  state?: CampaignState; // 집행 중 / 중지됨 / 삭제됨(API 상태 기준)
  why: string; // 옮긴 이유(이름 규칙 / 링크 규칙)
  days: DayRow[]; // [직전 기간 시작 … 기간 끝] 일별
};

const BRAND_IDS: BrandId[] = ["houscaper", "topogenesis"];

// "topogenesis", "TOPOGENESIS", "Topogenesis" 모두 받는다. 모르는 브랜드는 null.
export function parseBrand(v: string): BrandId | null {
  const k = v.trim().toLowerCase();
  return BRAND_IDS.find((b) => b === k) ?? null;
}

const split = (raw: string | undefined) => (raw ?? "").split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);

function pairs(raw: string | undefined): { key: string; to: BrandId }[] {
  const out: { key: string; to: BrandId }[] = [];
  for (const part of split(raw)) {
    const i = part.lastIndexOf("=>");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const to = parseBrand(part.slice(i + 2));
    if (key && to) out.push({ key, to });
  }
  return out;
}

export function loadRules(env: Record<string, string | undefined> = process.env): Rules {
  const defaults = (env.AD_REASSIGN_DEFAULTS ?? "").trim().toLowerCase() !== "off";
  const names: NameRule[] = [...(defaults ? [{ pattern: "topo", to: "topogenesis" as BrandId }] : []), ...pairs(env.AD_REASSIGN_RULES).map((p) => ({ pattern: p.key, to: p.to }))];
  const links: LinkRule[] = [
    ...(defaults ? [{ host: "topogenesis.xyz", to: "topogenesis" as BrandId }] : []),
    ...pairs(env.AD_REASSIGN_LINK_HOSTS).map((p) => ({ host: p.key.toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/^www\./, ""), to: p.to })),
  ];
  return { names, links, except: split(env.AD_REASSIGN_EXCEPT).map((s) => s.toLowerCase()) };
}

// 텍스트(JSON 등)에서 http(s) 링크의 호스트들을 뽑는다.
export function hostsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) out.add(m[1].toLowerCase().replace(/^www\./, ""));
  return [...out];
}

const hostMatches = (host: string, rule: string) => host === rule || host.endsWith(`.${rule}`);

// home: 광고 계정이 속한 브랜드. 다른 브랜드로 옮겨야 하면 { to, why }, 아니면 null.
export function decide(rules: Rules, home: BrandId, name: string, linkHosts: string[] = []): { to: BrandId; why: string } | null {
  const n = name.toLowerCase();
  if (rules.except.some((e) => n.includes(e))) return null;
  for (const r of rules.names) if (n.includes(r.pattern.toLowerCase())) return r.to === home ? null : { to: r.to, why: `이름에 "${r.pattern}"` };
  for (const r of rules.links) if (linkHosts.some((h) => hostMatches(h, r.host))) return r.to === home ? null : { to: r.to, why: `링크 ${r.host}` };
  return null;
}

// 일별 행에서 옮겨 간 캠페인의 일별 값을 뺀다(0 아래로는 내리지 않는다).
export function subtractDays(days: DayRow[], moved: DayRow[][]): DayRow[] {
  const sub = new Map<string, DayRow>();
  for (const m of moved) for (const d of m) {
    const c = sub.get(d.date) ?? { date: d.date, spend: 0, impressions: 0, clicks: 0 };
    c.spend += d.spend; c.impressions += d.impressions; c.clicks += d.clicks;
    sub.set(d.date, c);
  }
  return days.map((d) => {
    const s = sub.get(d.date);
    return s ? { date: d.date, spend: Math.max(0, d.spend - s.spend), impressions: Math.max(0, d.impressions - s.impressions), clicks: Math.max(0, d.clicks - s.clicks) } : d;
  });
}

export function addDays(days: DayRow[], moved: DayRow[][]): DayRow[] {
  const add = new Map<string, DayRow>();
  for (const m of moved) for (const d of m) {
    const c = add.get(d.date) ?? { date: d.date, spend: 0, impressions: 0, clicks: 0 };
    c.spend += d.spend; c.impressions += d.impressions; c.clicks += d.clicks;
    add.set(d.date, c);
  }
  return days.map((d) => {
    const a = add.get(d.date);
    return a ? { date: d.date, spend: d.spend + a.spend, impressions: d.impressions + a.impressions, clicks: d.clicks + a.clicks } : d;
  });
}
