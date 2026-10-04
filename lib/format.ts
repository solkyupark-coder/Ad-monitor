// 숫자·금액 표시 도구. 서버/클라이언트 양쪽에서 쓴다.
export type Kind = "won" | "count" | "pct";

const nf = new Intl.NumberFormat("ko-KR");

export function fmtCompact(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e5) return `${Math.round(n / 1e4)}만`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}만`;
  return nf.format(Math.round(n));
}

export function fmtValue(n: number, kind: Kind, currency = "KRW"): string {
  if (kind === "pct") return `${(n * 100).toFixed(2)}%`;
  if (kind === "won") return currency === "KRW" ? `${nf.format(Math.round(n))}원` : `${nf.format(Math.round(n * 100) / 100)} ${currency}`;
  return nf.format(Math.round(n));
}

export function fmtDate(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}
