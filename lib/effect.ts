// 광고 효과 추출(순수 함수): 광고 플랫폼의 비용·클릭과 GA4의 참여 세션(봇 의심 도시 제외)을 이어
// 채널·캠페인마다 '효과 있음 / 점검 / 낭비 / 보류'를 판정한다.
// 결제(Polar/Supabase)는 채널별로 나눌 수 없어 판정에 쓰지 않는다 — 효과는 '사람이 와서 참여했는가'까지만 본다.

import { fmtValue } from "@/lib/format";
import { isStopped, type CampaignState } from "@/lib/campaign-state";

export type Channel = "meta" | "google";
export type Verdict = "good" | "warn" | "bad" | "hold";

export type AdCampaignIn = { name: string; spend: number; impressions: number; clicks: number; state?: CampaignState; paidBy?: string };
export type GaCampaignRow = { campaign: string; sourceMedium: string; sessions: number; engagedSessions: number; engagementSec: number };

export type EffectRow = {
  channel: Channel;
  currency: string; // 이 행의 광고비 통화
  name: string; // 채널 행이면 채널 이름
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  sessions: number; // GA4 매칭 세션(봇 의심 도시 제외)
  engaged: number;
  engagementRate: number | null;
  costPerEngaged: number | null;
  landingRate: number | null; // 세션 / 클릭 — 낮으면 클릭이 사이트에 안 닿음
  verdict: Verdict;
  why: string;
  state?: CampaignState; // 집행 중 / 중지됨 / 삭제됨 (캠페인 행만)
  paidBy?: string; // 다른 브랜드 계정에서 결제된 캠페인이면 그 표시
  residual?: boolean; // 캠페인 목록 밖 광고비(상위 N개 제한 등) — 판정에서 제외
};

export type EffectReport = {
  currency: string;
  channels: EffectRow[];
  campaigns: EffectRow[];
  best: EffectRow | null; // 효과 있음 중 참여 1회당 비용이 가장 낮은 캠페인(집행 중인 것만 — 꺼진 캠페인으로 예산을 옮기라고 하지 않는다)
  worst: EffectRow | null; // 낭비 의심 중 광고비가 가장 큰 캠페인(집행 중인 것만)
  stoppedBad: EffectRow[]; // 이미 중지·삭제됐지만 낭비 의심이었던 캠페인(광고비 순) — 과거 기록으로만 보여 준다
  unmeasured: number; // GA4와 연결 못 한 캠페인 수
  baseline: number | null; // 기준: 연결된 행 전체의 참여 1회당 비용
  gaMissing: boolean; // GA4 캠페인 리포트를 못 읽음
  mixedCurrency: boolean; // 채널 통화가 달라 채널끼리 비용을 견주지 않음
  notes: string[];
};

// 판정 기준(README·화면 '판정 기준 보기'와 같은 값)
export const MIN_CLICKS = 20;
export const MIN_SESSIONS = 10;
export const BAD_RATE = 0.1;
export const GOOD_RATE = 0.4;
export const BAD_COST_MULT = 3;
export const HIGH_CTR = 0.025;

export const VERDICT_LABEL: Record<Verdict, string> = { good: "효과 있음", warn: "점검", bad: "낭비 의심", hold: "보류" };

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-·.()]+/g, ""); // 공백·기호·괄호는 무시("(cross-network)" = "Cross-network")

// GA4 소스/매체 → 광고 채널. 유료 매체만 광고로 본다(instagram / social 같은 일반 유입은 제외).
// 매체는 글자 덩어리로 나눠 본다("paid_social" → paid, social / "cpc" / "fb_ad" → fb, ad). 'ad'가 들어간 다른 낱말("reads")은 걸리지 않는다.
const GOOGLE_SRC = /^(google|youtube|googleads|google ads|gads)$/;
const GOOGLE_MED = new Set(["cpc", "ppc", "paid", "paidsearch", "display", "cpm", "video", "ad", "ads"]);
const META_SRC = /^(facebook|fb|instagram|ig|meta|an|audience_network|facebook\.com|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com|instagram\.com|l\.instagram\.com)$/;
const META_MED = new Set(["paid", "cpc", "ppc", "ad", "ads", "cpm", "paidsocial"]);

export function channelOf(sourceMedium: string): Channel | null {
  const [src = "", med = ""] = sourceMedium.toLowerCase().split("/").map((s) => s.trim());
  const tokens = med.split(/[^a-z]+/).filter(Boolean);
  // 성과 최대화·디맨드젠 등은 GA4가 "google / cross-network"로 기록한다.
  if (GOOGLE_SRC.test(src) && (tokens.some((t) => GOOGLE_MED.has(t)) || med.replace(/[^a-z]/g, "") === "crossnetwork")) return "google";
  if (META_SRC.test(src) && tokens.some((t) => META_MED.has(t))) return "meta";
  return null;
}

type Judge = {
  clicks: number; ctr: number | null; sessions: number; engaged: number; rate: number | null; cpe: number | null;
  baseline: number | null; // 다른 캠페인(또는 다른 채널) 평균 — 자기 자신은 뺀다
  currency: string; gaMissing: boolean; unmatched: boolean; ambiguous?: boolean; crossNetwork?: boolean;
};

export function judge(j: Judge): { verdict: Verdict; why: string } {
  const m = (v: number) => fmtValue(v, "won", j.currency);
  if (j.gaMissing) return { verdict: "hold", why: "GA4가 연결되지 않았거나 캠페인 데이터를 읽지 못해 판정할 수 없음" };
  if (j.ambiguous) return { verdict: "hold", why: "이름이 같은(공백·기호 무시) 캠페인이 둘 이상이라 GA4와 연결할 수 없음 — 캠페인 이름을 구분하세요" };
  if (j.clicks < MIN_CLICKS) return { verdict: "hold", why: `클릭 ${j.clicks}번뿐 — 표본 부족, 기간을 늘려 다시 보기` };
  if (j.sessions === 0) {
    if (j.crossNetwork) return { verdict: "hold", why: "GA4가 이 캠페인을 '(cross-network)'로 묶어 캠페인별로 연결할 수 없음(성과 최대화·디맨드젠 등)" };
    return { verdict: "hold", why: j.unmatched ? "GA4에 캠페인 이름이 안 잡힘 — 광고 링크에 utm_campaign(캠페인 이름) 필요" : "GA4에 이 광고의 방문이 없음 — 클릭이 사이트에 닿지 않았거나 추적 누락" };
  }
  if (j.sessions < MIN_SESSIONS) {
    const gap = j.sessions < j.clicks * 0.3 ? ` (클릭 ${j.clicks}번 대비 적음 — 클릭이 사이트에 안 닿았을 수 있음)` : "";
    return { verdict: "hold", why: `GA4 세션 ${j.sessions}개뿐 — 표본 부족${gap}` };
  }
  const rate = j.rate ?? 0;
  if (rate < BAD_RATE) return { verdict: "bad", why: `참여율 ${(rate * 100).toFixed(1)}% — 방문 ${j.sessions}번 중 참여 ${j.engaged}번${j.cpe ? ` · 참여 1회당 ${m(j.cpe)}` : ""}` };
  if (j.cpe !== null && j.baseline !== null && j.cpe >= j.baseline * BAD_COST_MULT) {
    return { verdict: "bad", why: `참여 1회당 ${m(j.cpe)} — 다른 캠페인 평균(${m(j.baseline)})의 ${(j.cpe / j.baseline).toFixed(1)}배` };
  }
  if (rate < GOOD_RATE) {
    const loud = j.ctr !== null && j.ctr > HIGH_CTR ? " · 클릭률은 높은데 참여가 낮음 — 지면·국가 확인" : "";
    return { verdict: "warn", why: `참여율 ${(rate * 100).toFixed(0)}%${loud}` };
  }
  if (j.cpe !== null && j.baseline !== null && j.cpe > j.baseline) return { verdict: "warn", why: `참여는 좋지만(${(rate * 100).toFixed(0)}%) 참여 1회당 ${m(j.cpe)}로 다른 캠페인 평균보다 비쌈` };
  return { verdict: "good", why: `참여율 ${(rate * 100).toFixed(0)}%${j.cpe ? ` · 참여 1회당 ${m(j.cpe)}` : ""}` };
}

type ChannelTotals = { spend: number; clicks: number; impressions: number };
type ChannelIn = { currency: string; campaigns: AdCampaignIn[]; total?: ChannelTotals } | null;

export function buildEffect(input: { meta: ChannelIn; ads: ChannelIn; gaCampaigns: GaCampaignRow[] | null; gaTruncated?: boolean }): EffectReport {
  const gaMissing = input.gaCampaigns === null;
  const gaCampaigns = input.gaCampaigns ?? [];
  const notes: string[] = [];
  type Side = { channel: Channel; label: string; currency: string; campaigns: AdCampaignIn[]; total?: ChannelTotals };
  const sides: Side[] = [];
  if (input.meta) sides.push({ channel: "meta", label: "메타", ...input.meta });
  if (input.ads) sides.push({ channel: "google", label: "구글 광고", ...input.ads });
  const currencies = [...new Set(sides.map((s) => s.currency))];
  const mixedCurrency = currencies.length > 1;
  if (mixedCurrency) notes.push(`채널 통화가 달라(${currencies.join(", ")}) 채널끼리 비용을 견주지 않고, 가장 효과적·낭비 의심 요약도 만들지 않습니다.`);
  if (input.gaTruncated) notes.push("GA4 캠페인 행이 많아 일부만 읽었습니다 — 방문이 적은 캠페인은 보류로 보일 수 있습니다.");

  // GA4 행을 채널별로: 캠페인 이름 없는 세션까지 채널 합계에 들어간다(데이터센터 도시는 요청 단계에서 이미 뺌).
  const gaOf = (channel: Channel) => gaCampaigns.filter((g) => channelOf(g.sourceMedium) === channel);

  // 1) 캠페인: 같은 채널의 GA 행 중 캠페인 이름이 같은 것만 잇는다(이름 비교는 공백·기호 무시).
  //    같은 채널에서 이름이 겹치는 광고 캠페인이 둘 이상이면 같은 GA 행을 두 번 세게 되므로 연결하지 않는다.
  const keyCount = new Map<string, number>();
  for (const side of sides) for (const c of side.campaigns) keyCount.set(`${side.channel}|${norm(c.name)}`, (keyCount.get(`${side.channel}|${norm(c.name)}`) ?? 0) + 1);
  type Pre = EffectRow & { unmatched: boolean; ambiguous: boolean; crossNetwork: boolean };
  const pre: Pre[] = [];
  for (const side of sides) {
    const rows = gaOf(side.channel);
    const named = rows.some((g) => g.campaign && !/^\((not set|direct|organic|referral)\)$/i.test(g.campaign));
    const crossNetwork = rows.some((g) => norm(g.campaign) === norm("(cross-network)"));
    for (const c of side.campaigns) {
      const ambiguous = (keyCount.get(`${side.channel}|${norm(c.name)}`) ?? 0) > 1;
      const hits = ambiguous ? [] : rows.filter((g) => norm(g.campaign) === norm(c.name));
      const sessions = hits.reduce((a, g) => a + g.sessions, 0);
      const engaged = Math.min(sessions, hits.reduce((a, g) => a + g.engagedSessions, 0));
      pre.push({
        channel: side.channel, name: c.name, currency: side.currency, spend: c.spend, impressions: c.impressions, clicks: c.clicks,
        ctr: c.impressions ? c.clicks / c.impressions : null,
        sessions, engaged,
        engagementRate: sessions ? engaged / sessions : null,
        costPerEngaged: engaged ? c.spend / engaged : null,
        landingRate: c.clicks ? sessions / c.clicks : null,
        verdict: "hold", why: "", state: c.state, paidBy: c.paidBy,
        unmatched: !named, ambiguous, crossNetwork,
      });
    }
  }
  // 기준(참여 1회당 비용): 같은 통화에서, 연결되고 표본이 충분한 행만. exclude 는 판정 대상 자신(자기 비용으로 기준을 올리지 않게).
  const pool = (currency: string, keep: (p: Pre) => boolean) => {
    const rows = pre.filter((p) => p.currency === currency && p.sessions >= MIN_SESSIONS && p.clicks >= MIN_CLICKS && keep(p));
    const spend = rows.reduce((a, r) => a + r.spend, 0);
    const engaged = rows.reduce((a, r) => a + r.engaged, 0);
    return rows.length && engaged ? spend / engaged : null;
  };
  const campaigns: EffectRow[] = pre.map((p) => {
    const j = judge({ clicks: p.clicks, ctr: p.ctr, sessions: p.sessions, engaged: p.engaged, rate: p.engagementRate, cpe: p.costPerEngaged, baseline: pool(p.currency, (o) => o !== p), currency: p.currency, gaMissing, unmatched: p.unmatched, ambiguous: p.ambiguous, crossNetwork: p.crossNetwork });
    const { unmatched: _u, ambiguous: _a, crossNetwork: _x, ...row } = p;
    return { ...row, ...j };
  });

  // 캠페인 목록에 안 잡힌 광고비(목록 상위 N개 제한 등)는 따로 보여 합계가 채널 광고비와 맞게 한다.
  for (const side of sides) {
    if (!side.total) continue;
    const gap = side.total.spend - side.campaigns.reduce((a, c) => a + c.spend, 0);
    if (gap > 0 && gap > side.total.spend * 0.01) {
      campaigns.push({
        channel: side.channel, name: "(목록 밖 캠페인)", currency: side.currency, spend: gap, impressions: 0, clicks: 0, ctr: null, sessions: 0, engaged: 0, engagementRate: null, costPerEngaged: null, landingRate: null,
        verdict: "hold", why: "캠페인 목록(상위 일부)에 안 잡힌 광고비 — 판정에서 제외", residual: true,
      });
    }
  }

  // 2) 채널: 광고 플랫폼 전체 합계(일별 합) + GA4의 해당 채널 유입 전체.
  const channels: EffectRow[] = sides.map((side) => {
    const spend = side.total?.spend ?? side.campaigns.reduce((a, c) => a + c.spend, 0);
    const impressions = side.total?.impressions ?? side.campaigns.reduce((a, c) => a + c.impressions, 0);
    const clicks = side.total?.clicks ?? side.campaigns.reduce((a, c) => a + c.clicks, 0);
    const rows = gaOf(side.channel);
    const sessions = rows.reduce((a, g) => a + g.sessions, 0);
    const engaged = Math.min(sessions, rows.reduce((a, g) => a + g.engagedSessions, 0));
    const rate = sessions ? engaged / sessions : null;
    const cpe = engaged ? spend / engaged : null;
    const ctr = impressions ? clicks / impressions : null;
    // 비교 기준은 다른 채널의 캠페인들(채널이 하나뿐이면 상대 비교 없음)
    const j = judge({ clicks, ctr, sessions, engaged, rate, cpe, baseline: pool(side.currency, (o) => o.channel !== side.channel), currency: side.currency, gaMissing, unmatched: false });
    return { channel: side.channel, name: side.label, currency: side.currency, spend, impressions, clicks, ctr, sessions, engaged, engagementRate: rate, costPerEngaged: cpe, landingRate: clicks ? sessions / clicks : null, ...j };
  });

  const live = (c: EffectRow) => !isStopped(c.state);
  const goods = mixedCurrency ? [] : campaigns.filter((c) => live(c) && c.verdict === "good" && c.costPerEngaged !== null).sort((a, b) => (a.costPerEngaged ?? 0) - (b.costPerEngaged ?? 0));
  const bads = mixedCurrency ? [] : campaigns.filter((c) => live(c) && c.verdict === "bad").sort((a, b) => b.spend - a.spend);
  const stoppedBad = campaigns.filter((c) => !live(c) && c.verdict === "bad").sort((a, b) => b.spend - a.spend);
  if (!gaMissing && campaigns.length && campaigns.every((c) => c.verdict === "hold")) notes.push("모든 캠페인이 보류입니다 — 표본이 적거나 광고 링크에 캠페인 이름(utm_campaign)이 없습니다.");
  return {
    currency: currencies[0] ?? "KRW",
    channels,
    campaigns,
    best: goods[0] ?? null,
    worst: bads[0] ?? null,
    stoppedBad,
    unmeasured: gaMissing ? 0 : campaigns.filter((c) => live(c) && !c.residual && c.verdict === "hold" && c.sessions === 0 && c.clicks >= MIN_CLICKS).length,
    baseline: mixedCurrency ? null : pool(currencies[0] ?? "KRW", () => true),
    gaMissing,
    mixedCurrency,
    notes,
  };
}

// ── '광고비가 간 곳'(판정별 광고비)과 결론 ───────────────────────
export type SpendClass = "bad" | "warn" | "good" | "hold" | "unmeasured";
export const SPEND_CLASS_LABEL: Record<SpendClass, string> = { bad: "낭비 의심", warn: "점검", good: "효과 있음", hold: "보류(표본 부족)", unmeasured: "측정 안 됨" };
export type SpendSegment = { key: SpendClass; label: string; spend: number; share: number };

// 통화가 하나일 때만 의미가 있다. 반환 합계가 0이면 빈 배열.
export function spendByClass(e: EffectReport): { total: number; segments: SpendSegment[] } {
  if (e.mixedCurrency) return { total: 0, segments: [] };
  const sums: Record<SpendClass, number> = { bad: 0, warn: 0, good: 0, hold: 0, unmeasured: 0 };
  for (const c of e.campaigns) {
    const k: SpendClass = c.residual || (c.verdict === "hold" && c.sessions === 0 && c.clicks >= MIN_CLICKS) ? "unmeasured" : c.verdict;
    sums[k] += c.spend;
  }
  const total = Object.values(sums).reduce((a, v) => a + v, 0);
  const order: SpendClass[] = ["bad", "warn", "good", "hold", "unmeasured"];
  return { total, segments: total > 0 ? order.filter((k) => sums[k] > 0).map((k) => ({ key: k, label: SPEND_CLASS_LABEL[k], spend: sums[k], share: sums[k] / total })) : [] };
}

export type EffectHeadline = { level: "bad" | "warn" | "good"; headline: string; action: string };
export const WASTE_SHARE_ALERT = 0.2;
export const UNMEASURED_SHARE_ALERT = 0.5;

// 지금 집행 중인 캠페인만 본 보고서(이미 중지·삭제된 캠페인은 행동 제안의 근거에서 뺀다).
const liveOnly = (e: EffectReport): EffectReport => ({ ...e, campaigns: e.campaigns.filter((c) => !isStopped(c.state)) });

export function effectHeadline(full: EffectReport): EffectHeadline | null {
  const e = liveOnly(full);
  const live = full.campaigns.some((c) => c.state === "active" || isStopped(c.state)) ? "집행 중인 " : ""; // 상태를 아는 경우에만 '집행 중' 이라고 말한다
  if (e.gaMissing || e.mixedCurrency || !e.campaigns.length) return null;
  const { total, segments } = spendByClass(e);
  if (total <= 0) return null;
  const share = (k: SpendClass) => segments.find((s) => s.key === k)?.share ?? 0;
  const p = (r: number) => `${Math.round(r * 100)}%`;
  const goods = e.campaigns.filter((c) => c.verdict === "good");
  if (share("bad") >= WASTE_SHARE_ALERT && e.worst) {
    return { level: "bad", headline: `${live}광고비의 ${p(share("bad"))}가 '낭비 의심' 캠페인에 쓰임`, action: `'${e.worst.name}'의 예산을 줄이거나 끈다${e.best ? `. 효과가 좋은 '${e.best.name}' 쪽으로 예산을 옮겨 본다` : ""}.` };
  }
  if (share("unmeasured") >= UNMEASURED_SHARE_ALERT) {
    return { level: "warn", headline: `${live}광고비의 ${p(share("unmeasured"))}는 사이트에서 효과를 잴 수 없음`, action: "메타 광고 링크에 utm_campaign(캠페인 이름)을 붙이고, 구글은 자동 태그(GA4 연결)를 확인한다." };
  }
  if (e.worst) {
    return { level: "warn", headline: `${live}낭비 의심 캠페인 ${e.campaigns.filter((c) => c.verdict === "bad").length}개 (광고비의 ${p(share("bad"))})`, action: `'${e.worst.name}'부터 지면·국가·소재를 확인한다.` };
  }
  if (goods.length && e.best) {
    return { level: "good", headline: `효과 있는 캠페인 ${goods.length}개 — 늘릴 후보`, action: `'${e.best.name}' 예산을 조금 늘리고 3일 뒤 참여 1회당 비용을 다시 본다.` };
  }
  return null;
}

// 이미 꺼진(중지·삭제) 캠페인 중 '낭비 의심'이었던 것: 할 일이 아니라 과거 기록. 행동 제안 없이 낮은 단계(info)로만 보여 준다.
export function effectHistory(e: EffectReport): { headline: string; action: string } | null {
  const rows = e.stoppedBad;
  if (!rows.length) return null;
  const money = (r: EffectRow) => fmtValue(r.spend, "won", r.currency);
  const allRemoved = rows.every((r) => r.state === "removed");
  const word = allRemoved ? "삭제됨" : "중지됨";
  const before = allRemoved ? "삭제 전" : "중지 전";
  const top = rows[0];
  const total = e.mixedCurrency ? null : rows.reduce((a, r) => a + r.spend, 0);
  return {
    headline: `이미 ${word}: '낭비 의심'이던 캠페인 ${rows.length}개 (${before} 지출 ${total !== null ? fmtValue(total, "won", top.currency) : money(top)})`,
    action: `이미 꺼져 있어 할 일 없음 — 과거 기록. 가장 큰 건 '${top.name}'(${money(top)}). 같은 소재·타깃으로 다시 켜기 전에만 참고한다.`,
  };
}

