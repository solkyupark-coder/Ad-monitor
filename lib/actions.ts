// 운영 체크: 모든 소스를 훑어 '지금 손봐야 할 것'을 심각도 순으로 모은다(순수 함수).
import type { Ga4Summary } from "@/lib/ga4";
import type { GoogleAdsSummary } from "@/lib/googleads";
import type { MetaSummary } from "@/lib/meta";
import type { RevenueSummary } from "@/lib/revenue";
import type { VercelSummary } from "@/lib/vercel";
import type { YoutubeSummary } from "@/lib/youtube";
import { compareRevenue } from "@/lib/traffic";
import { effectHeadline, effectHistory, type EffectReport } from "@/lib/effect";
import { isStopped } from "@/lib/campaign-state";
import { fmtValue } from "@/lib/format";

export type ActionLevel = "bad" | "warn" | "info" | "good";
export type ActionItem = { level: ActionLevel; area: string; title: string; action: string };

type Day = { clicks: number };
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const pctTxt = (r: number) => `${r > 0 ? "+" : ""}${Math.round(r * 100)}%`;
const CHANGE = 0.3; // 직전 기간 대비 이만큼 움직이면 알린다

// 클릭당 비용이 직전 기간보다 크게 오르면 경고. 그 채널 캠페인이 이미 모두 꺼져 있으면 경고 대신 과거 기록(info)으로 낮춘다.
function cpcCheck<T extends Day>(area: string, days: T[], n: number, cost: (d: T) => number, stopped: { spend: number; currency: string } | null): ActionItem | null {
  const cur = days.slice(-n);
  const prev = days.slice(-2 * n, -n);
  const cc = sum(cur, (d) => d.clicks);
  const pc = sum(prev, (d) => d.clicks);
  if (!cc || !pc) return null;
  const r = sum(cur, cost) / cc / (sum(prev, cost) / pc) - 1;
  if (r < CHANGE) return null;
  if (stopped) return { level: "info", area, title: `이미 중지됨 — 클릭당 비용 ${pctTxt(r)} (직전 기간 대비)`, action: `이 채널 캠페인은 이미 모두 꺼져 있어 할 일 없음 — 과거 기록(중지 전 지출 ${fmtValue(stopped.spend, "won", stopped.currency)}).` };
  return { level: "warn", area, title: `클릭당 비용 ${pctTxt(r)} (직전 기간 대비)`, action: "비용이 오른 캠페인을 표에서 찾아 예산을 줄이거나 소재를 바꾼다." };
}

export function buildActions(x: {
  days: number;
  meta: MetaSummary | null;
  ads: GoogleAdsSummary | null;
  ga: Ga4Summary | null;
  rev: RevenueSummary | null;
  vercel: VercelSummary | null;
  youtube: YoutubeSummary | null;
  pending: string[]; // 연결 안 된 플랫폼 이름
  verdict?: { level: string; headline: string; action: string; adSide?: boolean } | null; // '한눈에 보기' 결론
  effect?: EffectReport | null; // 광고 효과 판정(광고비 중 낭비·측정 불가 비중)
}): ActionItem[] {
  const out: ActionItem[] = [];
  // 캠페인 상태(집행 중 / 중지됨 / 삭제됨): 이미 꺼진 캠페인에는 '줄이거나 끄라'는 제안을 하지 않고 과거 기록으로 낮춘다.
  const rows = x.effect?.campaigns ?? [];
  const known = rows.filter((c) => !c.residual);
  const hasResidual = (ch?: string) => rows.some((c) => c.residual && (!ch || c.channel === ch));
  const channelStopped = (ch: "meta" | "google") => {
    const mine = known.filter((c) => c.channel === ch);
    return mine.length > 0 && !hasResidual(ch) && mine.every((c) => isStopped(c.state)) ? { spend: mine.reduce((a, c) => a + c.spend, 0), currency: mine[0].currency } : null;
  };
  const allStopped = known.length > 0 && !hasResidual() && known.every((c) => isStopped(c.state));
  if (x.verdict && (x.verdict.level === "bad" || x.verdict.level === "warn")) {
    if (x.verdict.adSide && allStopped) {
      out.push({ level: "info", area: "광고 퍼널", title: `이미 중지됨 — ${x.verdict.headline}`, action: "광고가 이미 모두 꺼져 있어 할 일 없음 — 과거 기록. 다시 켤 때 이 지면·국가 설정부터 확인한다." });
    } else {
      out.push({ level: x.verdict.level, area: "광고 퍼널", title: x.verdict.headline, action: x.verdict.action });
    }
  }
  const fx = x.effect ? effectHeadline(x.effect) : null;
  if (fx) out.push({ level: fx.level === "good" ? "info" : fx.level, area: "광고 효과", title: fx.headline, action: fx.action });
  const hist = x.effect ? effectHistory(x.effect) : null;
  if (hist) out.push({ level: "info", area: "광고 효과", title: hist.headline, action: hist.action });
  const failed = (area: string, s: { ok: boolean; reason?: string } | null) => {
    if (s && !s.ok) out.push({ level: "bad", area, title: `불러오기 실패: ${s.reason}`, action: "카드 안내대로 토큰·권한을 고치거나 다시 연결한다. 고치기 전까지 이 소스 수치는 빠진다." });
  };
  failed("메타", x.meta as { ok: boolean; reason?: string } | null);
  failed("구글 광고", x.ads as { ok: boolean; reason?: string } | null);
  failed("GA4", x.ga as { ok: boolean; reason?: string } | null);
  failed("실매출", x.rev as { ok: boolean; reason?: string } | null);
  failed("Vercel", x.vercel as { ok: boolean; reason?: string } | null);
  failed("유튜브", x.youtube as { ok: boolean; reason?: string } | null);
  if (x.youtube?.ok && x.youtube.analytics && !x.youtube.analytics.ok) {
    out.push({ level: "warn", area: "유튜브", title: `기간별 지표 없음: ${x.youtube.analytics.reason}`, action: x.youtube.analytics.reconnect ? "유튜브 패널의 '유튜브 다시 연결'로 새 refresh token을 받아 Vercel에 넣는다. 그동안 채널 현황(구독자·최근 영상)만 보인다." : "안내대로 설정을 고친다. 그동안 채널 현황(구독자·최근 영상)만 보인다." });
  }

  // 사이트·배포
  if (x.vercel?.ok) {
    const last = x.vercel.deploys[0];
    if (last?.state === "ERROR") out.push({ level: "bad", area: "Vercel", title: "최근 프로덕션 배포가 실패했다", action: "Vercel 빌드 로그를 확인하고 고쳐서 다시 배포한다. 광고는 이전 배포 사이트로 계속 들어오고 있다." });
    const a = x.vercel.analytics;
    if (a.ok) {
      const cur = sum(a.days.slice(-x.days), (d) => d.visitors);
      const prev = sum(a.days.slice(0, -x.days), (d) => d.visitors);
      if (x.days > 1 && prev > 20 && cur / prev - 1 <= -CHANGE) out.push({ level: "warn", area: "Vercel", title: `사이트 방문자 ${pctTxt(cur / prev - 1)} (직전 기간 대비)`, action: "광고가 꺼졌는지, 배포 뒤 페이지가 깨졌는지부터 확인한다." });
    }
  }

  // 매출 대조
  if (x.rev?.ok) {
    if (x.rev.alt?.ok && x.rev.alt.orders !== x.rev.orders) {
      out.push({ level: "warn", area: "실매출", title: `Polar ${x.rev.orders}건 / Supabase ${x.rev.alt.orders}건으로 다르다`, action: "테스트 결제·환불·웹훅 지연 중 무엇인지 확인해 둘 중 하나를 고친다." });
    }
    if (x.ga?.ok) {
      const c = compareRevenue({ purchases: x.ga.real.purchases, revenue: x.ga.real.revenue, currency: x.ga.currency, datacenterPurchases: 0 }, { orders: x.rev.orders, amount: x.rev.amount, currency: x.rev.currency });
      if (c.level === "warn") out.push({ level: "warn", area: "GA4", title: c.message, action: "광고 플랫폼에 보내는 구매 이벤트를 실제 결제 확인 뒤에만 보내도록 고친다(광고 학습이 가짜 구매로 오염된다)." });
    }
  }

  // 광고 효율
  // 1일 보기는 표본이 작아 직전 기간 대비 경고를 만들지 않는다(클릭 몇 번으로 비용이 크게 출렁인다).
  if (x.meta?.ok && x.days > 1) {
    const c = cpcCheck("메타", x.meta.days, x.days, (d) => d.spend, channelStopped("meta"));
    if (c) out.push(c);
  }
  if (x.ads?.ok && x.days > 1) {
    const c = cpcCheck("구글 광고", x.ads.days, x.days, (d) => d.cost, channelStopped("google"));
    if (c) out.push(c);
  }

  if (x.pending.length) out.push({ level: "info", area: "연결", title: `연결 안 된 소스 ${x.pending.length}개: ${x.pending.join(", ")}`, action: "아래 '연결이 필요한 플랫폼'에 필요한 env 이름이 있다." });

  const order: Record<ActionLevel, number> = { bad: 0, warn: 1, info: 2, good: 3 };
  out.sort((a, b) => order[a.level] - order[b.level]);
  if (!out.some((a) => a.level === "bad" || a.level === "warn")) out.unshift({ level: "good", area: "전체", title: "급한 문제 없음", action: "위 '한눈에 보기'의 결론과 결제 1건당 광고비 추세만 보면 된다." });
  return out;
}
