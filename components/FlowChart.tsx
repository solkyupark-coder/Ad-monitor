"use client";
// 일별 흐름: 광고비 / 클릭 / 방문자 중 하나를 골라 한 칸에 그린다(세 개를 세로로 쌓지 않는다).
import { useState } from "react";
import { TrendChart } from "@/components/TrendChart";
import type { Kind } from "@/lib/format";

export type FlowSeries = {
  key: string;
  label: string;
  kind: Kind;
  currency?: string;
  total: string; // 기간 합계 표시(미리 서식 처리)
  points: { date: string; value: number }[];
};

export function FlowChart({ series }: { series: FlowSeries[] }) {
  const [key, setKey] = useState(series[0]?.key);
  if (!series.length) return null;
  const cur = series.find((s) => s.key === key) ?? series[0];
  return (
    <div className="flow">
      <div className="flow-head">
        <h3>일별 흐름</h3>
        <div className="seg" role="group" aria-label="보는 지표">
          {series.map((s) => (
            <button key={s.key} type="button" aria-pressed={s.key === cur.key} className={s.key === cur.key ? "on" : ""} onClick={() => setKey(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <p className="flow-total">
        {cur.label} 합계 <strong>{cur.total}</strong>
      </p>
      <TrendChart points={cur.points} kind={cur.kind} currency={cur.currency} color="s1" name={cur.label} />
    </div>
  );
}
