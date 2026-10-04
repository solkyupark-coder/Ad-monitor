"use client";
import { useState } from "react";
import { fmtCompact, fmtDate, fmtValue, type Kind } from "@/lib/format";

type Pt = { date: string; value: number };

const W = 480;
const H = 200;
const L = 40;
const R = 54;
const T = 14;
const B = 26;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function TrendChart({
  points,
  kind,
  currency,
  color,
  name,
}: {
  points: Pt[];
  kind: Kind;
  currency?: string;
  color: "s1" | "s2";
  name: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  if (n === 0) return <p className="note">표시할 데이터가 없습니다.</p>;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const x = (i: number) => L + (n <= 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const area = `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  const active = hover ?? n - 1;
  const ticks = [0, max / 2, max];
  const stroke = `var(--${color})`;

  const locate = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((sx - L) / (W - L - R)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const leftPct = Math.max(14, Math.min(86, (x(active) / W) * 100));

  return (
    <div className="chart">
      <div className="tip" style={{ left: `${leftPct}%`, opacity: hover === null ? 0 : 1 }} aria-hidden>
        <strong>{fmtValue(points[active].value, kind, currency)}</strong>
        <span>{fmtDate(points[active].date)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${name}: 최근 ${n}일 추이`}
        tabIndex={0}
        onPointerMove={(e) => locate(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onFocus={() => setHover(n - 1)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover(Math.max(0, active - 1));
          if (e.key === "ArrowRight") setHover(Math.min(n - 1, active + 1));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">
              {kind === "pct" ? `${(t * 100).toFixed(1)}%` : fmtCompact(t)}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth="1" />
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="axis">
            {fmtDate(points[i].date)}
          </text>
        ))}
        <path d={area} fill={stroke} opacity="0.1" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <line x1={x(active)} x2={x(active)} y1={T} y2={y(0)} stroke="var(--axis)" strokeWidth="1" />}
        <circle cx={x(active)} cy={y(points[active].value)} r="6" fill="var(--surface)" />
        <circle cx={x(active)} cy={y(points[active].value)} r="4" fill={stroke} />
        {hover === null && (
          <text x={x(n - 1) + 10} y={y(points[n - 1].value) + 4} className="endlabel">
            {kind === "pct" ? `${(points[n - 1].value * 100).toFixed(2)}%` : fmtCompact(points[n - 1].value)}
          </text>
        )}
      </svg>
      <details className="tableview">
        <summary>표로 보기</summary>
        <table>
          <thead>
            <tr>
              <th>날짜</th>
              <th>{name}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{fmtValue(p.value, kind, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
