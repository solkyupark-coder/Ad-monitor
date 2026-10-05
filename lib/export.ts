// 광고 효과 내보내기(순수 함수): CSV와 복사용 텍스트 요약. 서버(app/api/export)와 화면(미리보기)이 같이 쓴다.
// 토큰·계정 ID는 이 데이터에 들어 있지 않다(집계 숫자와 캠페인 이름뿐).
import type { Dashboard } from "@/lib/dashboard";
import type { EffectRow } from "@/lib/effect";
import { VERDICT_LABEL } from "@/lib/effect";
import { offsetMs } from "@/lib/range";
import { fmtValue } from "@/lib/format";

export type ExportPart = "funnel" | "channels" | "campaigns" | "daily";
export const EXPORT_PARTS: ExportPart[] = ["funnel", "channels", "campaigns", "daily"];
export type ExportOptions = { parts: ExportPart[]; caveat: boolean };
export const DEFAULT_EXPORT: ExportOptions = { parts: ["funnel", "channels", "campaigns"], caveat: true };

export type ExportData = {
  demo: boolean; // 데모 데이터면 파일·요약에 그대로 표시해 실제 수치로 오해되지 않게 한다
  generatedAt: string; // 만든 시각(날짜 경계 시간대 기준, "MM-DD HH:mm")
  brand: string;
  brandLabel: string;
  range: { from: string; to: string; days: number };
  currency: string;
  spend: number | null;
  headline: string | null;
  action: string | null;
  steps: { label: string; value: number | null; rate: number | null }[];
  channels: EffectRow[];
  campaigns: EffectRow[];
  daily: { date: string; spend: number | null; impressions: number; clicks: number; visitors: number | null }[];
  best: EffectRow | null;
  worst: EffectRow | null;
  unmeasured: number;
  baseline: number | null;
};

export function exportData(d: Dashboard, now: Date = new Date()): ExportData {
  const visitors = new Map<string, number>();
  if (d.vc && d.vc.ok && d.vc.analytics.ok) d.vc.analytics.days.forEach((v) => visitors.set(v.date, v.visitors));
  return {
    demo: d.demo,
    generatedAt: new Date(now.getTime() + offsetMs()).toISOString().slice(5, 16).replace("T", " "),
    brand: d.brand,
    brandLabel: d.brandLabel,
    range: { from: d.range.from, to: d.range.to, days: d.range.days },
    currency: d.effect.currency,
    spend: d.overview.spend,
    headline: d.overview.verdict?.headline ?? null,
    action: d.overview.verdict?.action ?? null,
    steps: d.overview.steps.map((s) => ({ label: s.label, value: s.value, rate: s.rateFromPrev })),
    channels: d.effect.channels,
    campaigns: d.effect.campaigns,
    daily: d.overview.daily.map((p) => ({ ...p, visitors: visitors.get(p.date) ?? null })),
    best: d.effect.best,
    worst: d.effect.worst,
    unmeasured: d.effect.unmeasured,
    baseline: d.effect.baseline,
  };
}

export function parseExportOptions(sp: URLSearchParams): ExportOptions {
  const raw = sp.get("parts");
  const parts = raw === null ? DEFAULT_EXPORT.parts : (raw.split(",").filter((p): p is ExportPart => (EXPORT_PARTS as string[]).includes(p)) as ExportPart[]);
  return { parts: parts.length ? parts : DEFAULT_EXPORT.parts, caveat: sp.get("caveat") !== "0" };
}

export const exportQuery = (o: ExportOptions): string => `parts=${o.parts.join(",")}&caveat=${o.caveat ? 1 : 0}`;
export const exportFileName = (e: ExportData, ext: "csv" | "txt"): string => `${e.demo ? "DEMO_" : ""}ad-effect_${e.brand}_${e.range.from}_${e.range.to}.${ext}`;

// ── CSV ─────────────────────────────────────────────
const FORMULA = /^[=+\-@\t\r]/;
// 문자열 칸: 수식으로 읽히지 않게 앞에 '를 붙이고, 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다.
export function csvText(v: string): string {
  const safe = FORMULA.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
const num = (v: number | null, digits = 0): string => (v === null || !Number.isFinite(v) ? "" : String(Math.round(v * 10 ** digits) / 10 ** digits));
// 금액 칸: 원·엔처럼 소수가 없는 통화만 정수, 나머지는 소수 둘째 자리까지(USD 1.25 → 1.25).
const ZERO_DECIMAL = new Set(["KRW", "JPY", "VND", "CLP", "ISK", "UGX", "XAF", "XOF"]);
const money = (v: number | null, cur: string): string => num(v, ZERO_DECIMAL.has(cur.toUpperCase()) ? 0 : 2);
const pct = (v: number | null): string => (v === null ? "" : `${(v * 100).toFixed(1)}%`);

export const CSV_HEADER = ["구분", "이름", "채널", "값", "광고비", "통화", "노출", "클릭", "클릭률", "GA세션", "참여세션", "참여율", "참여1회당비용", "판정", "비고"];

export function effectCsv(e: ExportData, o: ExportOptions): string {
  const rows: string[][] = [];
  const t = csvText;
  const row = (kind: string, name: string, f: Partial<Record<(typeof CSV_HEADER)[number], string>>, cur = e.currency) =>
    rows.push(CSV_HEADER.map((h) => (h === "구분" ? t(kind) : h === "이름" ? t(name) : h === "통화" && f["광고비"] ? cur : (f[h] ?? ""))));
  const eff = (kind: string, r: EffectRow) =>
    row(kind, r.name, {
      채널: t(r.channel === "meta" ? "메타" : "구글 광고"),
      광고비: money(r.spend, r.currency),
      노출: num(r.impressions),
      클릭: num(r.clicks),
      클릭률: pct(r.ctr),
      GA세션: num(r.sessions),
      참여세션: num(r.engaged),
      참여율: pct(r.engagementRate),
      참여1회당비용: money(r.costPerEngaged, r.currency),
      판정: t(VERDICT_LABEL[r.verdict]),
      비고: t(r.why),
    }, r.currency);
  if (o.parts.includes("funnel")) {
    e.steps.forEach((s) => row("퍼널", s.label, { 값: num(s.value), 비고: s.rate === null ? "" : t(`직전 단계 대비 ${pct(s.rate)}`) }));
    if (e.spend !== null) row("퍼널", "총 광고비", { 값: money(e.spend, e.currency), 광고비: money(e.spend, e.currency) });
  }
  if (o.parts.includes("channels")) e.channels.forEach((r) => eff("채널", r));
  if (o.parts.includes("campaigns")) e.campaigns.forEach((r) => eff("캠페인", r));
  if (o.parts.includes("daily")) {
    e.daily.forEach((p) =>
      row("일별", p.date, { 값: p.visitors === null ? "" : num(p.visitors), 광고비: p.spend === null ? "" : money(p.spend, e.currency), 노출: num(p.impressions), 클릭: num(p.clicks), 클릭률: p.impressions ? pct(p.clicks / p.impressions) : "", 비고: p.visitors === null ? "" : "값=사이트 방문자(Vercel)" }),
    );
  }
  const lines = [CSV_HEADER.join(","), ...rows.map((r) => r.join(","))];
  if (e.demo) lines.push("", csvText("# 데모 데이터입니다 — 실제 수치가 아닙니다"));
  if (o.caveat) {
    lines.push(
      "",
      ...[
      `# ${e.brandLabel} ${e.range.from}~${e.range.to} (${e.range.days}일) · ${e.generatedAt} 기준`,
      "# 참여 = GA4 참여 세션. 데이터센터 도시(Ashburn 등) 세션은 요청 단계에서 제외, 그 밖의 봇 의심 판정은 반영되지 않을 수 있음",
      "# 캠페인은 GA4 캠페인 이름과 광고 캠페인 이름이 같을 때만 연결(공백·기호 무시). 메타는 광고 링크에 utm_campaign 필요",
      "# 판정: 보류=클릭 20 미만 또는 GA 세션 10 미만 / 낭비=참여율 10% 미만 또는 참여 1회당 비용이 평균의 3배 이상 / 점검=참여율 40% 미만 / 효과 있음=참여율 40% 이상이고 평균 이하 비용",
      "# 실제 결제(Polar/Supabase)는 채널별로 나눌 수 없어 판정에 쓰지 않음",
      ].map(csvText),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`; // 엑셀이 UTF-8 한글을 바로 읽도록 BOM
}

// ── 복사용 텍스트 ───────────────────────────────────
const won = (v: number, cur: string) => fmtValue(v, "won", cur);
const int = (v: number) => Math.round(v).toLocaleString("ko-KR");

export function effectText(e: ExportData, o: ExportOptions): string {
  const L: string[] = [];
  const cur = e.currency;
  L.push(`${e.demo ? "[데모 데이터] " : ""}[${e.brandLabel}] 광고 효과 ${e.range.from} ~ ${e.range.to} (${e.range.days}일) · ${e.generatedAt} 기준`);
  if (o.parts.includes("funnel")) {
    const flow = e.steps.map((s) => `${s.label} ${s.value === null ? "연결 안 됨" : int(s.value)}`).join(" → ");
    L.push(`${e.spend !== null ? `광고비 ${won(e.spend, cur)} · ` : ""}${flow}`);
    if (e.headline) L.push(`결론: ${e.headline}`);
  }
  if (o.parts.includes("channels")) {
    e.channels.forEach((c) => L.push(`채널 ${c.name}: ${VERDICT_LABEL[c.verdict]} — 광고비 ${won(c.spend, c.currency)}, 클릭 ${int(c.clicks)}${c.costPerEngaged !== null ? `, 참여 1회당 ${won(c.costPerEngaged, c.currency)}` : ""} (${c.why})`));
  }
  if (o.parts.includes("campaigns")) {
    L.push(e.best ? `가장 효과적: ${e.best.name} (${e.best.channel === "meta" ? "메타" : "구글"}) — ${e.best.why}` : "가장 효과적: 판정된 캠페인 없음");
    L.push(e.worst ? `가장 큰 낭비: ${e.worst.name} (${e.worst.channel === "meta" ? "메타" : "구글"}) — 광고비 ${won(e.worst.spend, e.worst.currency)}, ${e.worst.why}` : "가장 큰 낭비: 없음");
    if (e.unmeasured) L.push(`측정 안 됨: 캠페인 ${e.unmeasured}개(GA4에 캠페인 이름이 안 잡힘 — utm_campaign 필요)`);
  }
  if (o.parts.includes("daily") && e.daily.length) {
    const sp = e.daily.filter((p) => p.spend !== null).map((p) => p.spend as number);
    if (sp.length) L.push(`일별 광고비 ${won(Math.min(...sp), cur)} ~ ${won(Math.max(...sp), cur)}, 클릭 ${int(Math.min(...e.daily.map((p) => p.clicks)))} ~ ${int(Math.max(...e.daily.map((p) => p.clicks)))}`);
  }
  if (e.action) L.push(`다음 할 일: ${e.action}`);
  if (e.demo) L.push("※ 데모 데이터입니다 — 실제 수치가 아닙니다");
  if (o.caveat) L.push("※ 참여는 GA4 참여 세션(데이터센터 도시 제외) 기준, 실제 결제는 채널별로 나눌 수 없어 판정에 쓰지 않음");
  return L.join("\n");
}
