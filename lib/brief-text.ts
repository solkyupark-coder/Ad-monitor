// 요약(lib/brief.ts)을 짧은 표 글로 바꾼다. ad-monitor-mcp의 get_metrics가 Edge Config "metrics"에서 이 글을 그대로 내준다.
// Edge Config는 용량이 작아 브랜드당 몇 KB로 줄인다. 실패한 소스는 이유를 한 줄로 남긴다(0으로 보이지 않게).
import type { brandBrief } from "@/lib/brief";

type B = Awaited<ReturnType<typeof brandBrief>>;
const n = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "-" : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("en-US"));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "-" : `${Math.round(v * 100)}%`);
const vs = (cur: number, prev: number | null | undefined) => (prev ? ` (직전 ${n(prev)}, ${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}%)` : "");
const cut = (s: string, len = 40) => (s.length > len ? `${s.slice(0, len - 1)}…` : s);

function block(title: string, b: B, short = false): string[] {
  const L: string[] = [`[${title}]`];
  const m = b.meta;
  if (b.metaAccount) L.push(`메타 계정: ${b.metaAccount.status}${b.metaAccount.disableReason ? ` (비활성 사유 코드 ${b.metaAccount.disableReason})` : ""}`);
  else if (b.metaExtraError) L.push(`메타 계정 상태 못 읽음: ${b.metaExtraError}`);
  if (m && m.ok) {
    L.push(`메타: 지출 ${n(m.spend, 2)} ${m.currency}${vs(m.spend, m.spendPrev)} · 클릭 ${n(m.clicks)} · 노출 ${n(m.impressions)} · 마지막 지출일 ${m.lastSpendDate ?? "없음"}`);
    if (!short) m.campaigns.filter((c) => c.spend > 0).slice(0, 4).forEach((c) => L.push(`  - ${cut(c.name)} [${c.state ?? "?"}] ${n(c.spend, 2)} · 링크클릭 ${n(c.linkClicks)} · 랜딩 ${n(c.landingViews)}`));
  } else if (m && !m.ok) L.push(`메타 못 읽음: ${m.reason}`);
  if (!short && b.metaCountries?.length) L.push(`메타 나라별: ${b.metaCountries.slice(0, 6).map((c) => `${c.country} ${n(c.spend, 2)}/${c.linkClicks}클릭${c.cpc !== null ? `(${n(c.cpc, 2)})` : ""}`).join(" | ")}`);
  const a = b.googleAds;
  if (a && a.ok) L.push(`구글 광고: 지출 ${n(a.spend, 2)} ${a.currency}${vs(a.spend, a.spendPrev)} · 클릭 ${n(a.clicks)}`);
  else if (a && !a.ok) L.push(`구글 광고 못 읽음: ${a.reason}`);
  const g = b.ga4;
  if (g && g.ok) {
    L.push(`GA4(봇·본인 제외): 사용자 ${n(g.real.activeUsers)}${vs(g.real.activeUsers, g.realPrev.activeUsers)} · 세션 ${n(g.real.sessions)} · 참여율 ${pct(g.real.engagementRate)} · 결제 ${n(g.real.purchases)}`);
    if (!short) L.push(`유입: ${g.sources.slice(0, 5).map((s) => `${cut(s.sourceMedium, 28)} ${s.sessions}세션 ${pct(s.sessions ? s.engagedSessions / s.sessions : 0)}`).join(" | ")}`);
    const byCountry = new Map<string, number>();
    g.countries.forEach((r) => byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + r.sessions));
    if (!short) L.push(`나라: ${[...byCountry].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([c, s]) => `${c} ${s}`).join(" | ")}`);
  } else if (g && !g.ok) L.push(`GA4 못 읽음: ${g.reason}`);
  const e = b.ga4Events;
  if (e.ok) {
    L.push(`행동(이벤트): ${e.events.slice(0, short ? 6 : 10).map((x) => `${x.name} ${x.count}${x.prev ? `(직전 ${x.prev})` : ""}`).join(" | ") || "없음"} · GA4 마지막 데이터 ${e.lastDate ?? "?"}`);
    const keyRows = e.byCountry.filter((r) => !/^(page_|session|first_|user_)/.test(r.event)).slice(0, 8);
    if (!short && keyRows.length) L.push(`행동×나라: ${keyRows.map((r) => `${r.country}/${r.event} ${r.count}`).join(" | ")}`);
  } else L.push(`GA4 이벤트 못 읽음: ${e.reason}`);
  if (b.signups) L.push(`가입: ${b.signups.count}${b.signups.prev !== null ? ` (직전 ${b.signups.prev})` : ""}`);
  if (b.orders && b.orders.ok) L.push(`결제(${b.orders.source}): ${b.orders.orders}건 ${n(b.orders.amount, 2)} ${b.orders.currency}`);
  else if (b.orders && !b.orders.ok) L.push(`결제 못 읽음: ${b.orders.reason}`);
  if (b.etsy && b.etsy.ok) L.push(`엣시: 주문 ${b.etsy.cur.orders} · ${n(b.etsy.cur.amount, 2)} ${b.etsy.currency}`);
  const y = b.youtube;
  if (short) return L;
  if (y && y.ok && y.analytics && "cur" in y.analytics && y.analytics.cur) L.push(`유튜브: 조회 ${n(y.analytics.cur.views)}${vs(y.analytics.cur.views, y.analytics.prev?.views)} · 시청 ${n(y.analytics.cur.minutes)}분 · 구독 ${y.analytics.cur.subsNet >= 0 ? "+" : ""}${y.analytics.cur.subsNet} (데이터 ${y.analytics.lastDate ?? "?"}까지)`);
  else if (y && !y.ok) L.push(`유튜브 못 읽음: ${y.reason}`);
  const s = b.search;
  if (s.ok) L.push(`구글 검색: 클릭 ${n(s.cur.clicks)} · 노출 ${n(s.cur.impressions)} · 평균 순위 ${n(s.cur.position, 1)} (데이터 ${s.lastDate ?? "?"}까지) · 검색어 ${s.queries.slice(0, 4).map((q) => cut(q.key ?? "", 20)).join(", ")}`);
  else L.push(`구글 검색 못 읽음: ${s.reason}`);
  if (b.vercel) L.push(`사이트 방문자(Vercel): ${n(b.vercel.visitors)}`);
  b.alerts.filter((x) => x.level === "bad" || x.level === "warn").slice(0, 3).forEach((x) => L.push(`⚠ ${cut(x.title, 90)} → ${cut(x.action, 90)}`));
  return L;
}

export function briefText(day: B, period: B, periodLabel: string): string {
  return [...block("어제", day, true), "", ...block(periodLabel, period)].join("\n");
}
