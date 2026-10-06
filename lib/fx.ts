// 통화가 다른 광고비(예: 메타 USD + 구글 KRW)를 원화로 환산해 합친다. 실시간 환율이 아니라 고정값(env로 바꿈)이다 — 대략의 규모를 보는 용도.
// env: FX_USD_KRW=1400            달러 환율(원) — 기본 1400
//      FX_RATES=USD=1380,JPY=9.2  통화별 원화 환율(위보다 우선). KRW 는 항상 1
// 순수 함수만 둔다(테스트하기 쉽게 외부 import 없음).

export type Rates = Record<string, number>; // 1 단위당 원

export const DEFAULT_USD_KRW = 1400;

export function fxRates(env: Record<string, string | undefined> = process.env): Rates {
  const rates: Rates = { KRW: 1, USD: DEFAULT_USD_KRW };
  const usd = Number(env.FX_USD_KRW);
  if (Number.isFinite(usd) && usd > 0) rates.USD = usd;
  for (const part of (env.FX_RATES ?? "").split(/[,;\s]+/)) {
    const m = /^([A-Za-z]{3})=(\d+(?:\.\d+)?)$/.exec(part.trim());
    if (m && Number(m[2]) > 0 && m[1].toUpperCase() !== "KRW") rates[m[1].toUpperCase()] = Number(m[2]);
  }
  return rates;
}

export type SpendPart = { currency: string; spend: number };
export type CurrencyPlan = {
  currency: string | null; // 합산 통화(합칠 수 없으면 null)
  mixed: boolean; // 지출이 있는 통화가 둘 이상이라 원화로 환산했는가
  mult: (c: string) => number | null; // 통화 c 의 금액에 곱할 값(합산 통화로). 환산할 수 없으면 null
  note: string | null; // 환산했을 때 화면에 보일 설명(원통화 + 환율)
};

const fmt = (v: number, c: string) => (c === "KRW" ? `${Math.round(v).toLocaleString("ko-KR")}원` : `${v.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} ${c}`);

// 지출이 0인 통화는 무시한다. 지출 있는 통화가 하나면 그 통화, 둘 이상이면 모두 환율을 아는 경우에만 원화로 환산한다.
export function planCurrency(parts: SpendPart[], rates: Rates): CurrencyPlan {
  const spent = new Map<string, number>();
  for (const p of parts) if (p.spend > 0) spent.set(p.currency, (spent.get(p.currency) ?? 0) + p.spend);
  const spentCur = [...spent.keys()];
  if (spentCur.length <= 1) {
    const currency = spentCur[0] ?? parts[0]?.currency ?? null;
    return { currency, mixed: false, mult: (c) => (c === currency ? 1 : currency === "KRW" ? rates[c] ?? null : null), note: null };
  }
  if (!spentCur.every((c) => rates[c])) return { currency: null, mixed: false, mult: () => null, note: null };
  const used = spentCur.filter((c) => c !== "KRW");
  const note = `원화 환산 합계 — 원통화 ${spentCur.map((c) => fmt(spent.get(c) as number, c)).join(" + ")} · ${used.map((c) => `환율 1 ${c} = ${rates[c].toLocaleString("ko-KR")}원`).join(", ")}(고정값 가정, env FX_USD_KRW·FX_RATES로 바꿈)`;
  return { currency: "KRW", mixed: true, mult: (c) => rates[c] ?? null, note };
}

// 다른 통화로 옮길 때 곱할 값(두 통화 모두 환율을 알 때만). 같은 통화면 1.
export function ratio(from: string, to: string, rates: Rates): number | null {
  if (from === to) return 1;
  return rates[from] && rates[to] ? rates[from] / rates[to] : null;
}
