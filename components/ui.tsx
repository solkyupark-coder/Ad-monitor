import { fmtValue, type Kind } from "@/lib/format";

// 전주 대비 증감. 방향 색은 '오르면 좋은지'에 따라 정하고, 항상 화살표+문구를 같이 쓴다.
export function Delta({ cur, prev, goodWhen }: { cur: number; prev: number | null; goodWhen: "up" | "down" | "neutral" }) {
  if (prev === null || prev === 0) return <span className="delta flat">전주 비교 없음</span>;
  const r = (cur - prev) / prev;
  if (Math.abs(r) < 0.0005) return <span className="delta flat">― 변동 없음</span>;
  const up = r > 0;
  const cls = goodWhen === "neutral" ? "flat" : (up ? goodWhen === "up" : goodWhen === "down") ? "good" : "bad";
  return (
    <span className={`delta ${cls}`}>
      {up ? "▲" : "▼"} {Math.abs(r * 100).toFixed(1)}% <span className="vs">전주 대비</span>
    </span>
  );
}

export function Stat({
  label,
  value,
  kind,
  currency,
  hero,
  children,
}: {
  label: string;
  value: number | string;
  kind?: Kind;
  currency?: string;
  hero?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={hero ? "stat hero" : "stat"}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{typeof value === "number" && kind ? fmtValue(value, kind, currency) : value}</p>
      {children}
    </div>
  );
}

export function BarList({
  items,
  color,
}: {
  items: { id: string; label: string; value: number; display: string; note: string }[];
  color: "s1" | "s2";
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="bars">
      {items.map((i) => (
        <li key={i.id} tabIndex={0}>
          <span className="bar-label" title={i.label}>
            {i.label}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max(1, (i.value / max) * 100)}%`, background: `var(--${color})` }} />
          </span>
          <span className="bar-value">{i.display}</span>
          <span className="bar-tip">{i.note}</span>
        </li>
      ))}
    </ul>
  );
}
