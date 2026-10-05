import { fmtValue } from "@/lib/format";
import { logWidth, type Overview } from "@/lib/overview";
import { Stat } from "@/components/ui";
import type { DateRange } from "@/lib/range";
import type { ActionItem } from "@/lib/actions";

const n = (v: number) => fmtValue(v, "count");
const pct = (r: number) => (r === 0 ? "0%" : r >= 0.1 ? `${(r * 100).toFixed(0)}%` : r >= 0.001 ? `${(r * 100).toFixed(1)}%` : `${(r * 100).toFixed(2)}%`);

export function OverviewPanel({ o, range }: { o: Overview; range: DateRange }) {
  const max = Math.max(...o.steps.map((s) => s.value ?? 0), 1);
  const money = (v: number | null, empty: string) => (v === null ? empty : fmtValue(v, "won", o.currency));
  return (
    <section className="panel overview">
      <div className="panel-head">
        <h2>한눈에 보기</h2>
        <p className="meta">{range.label} · 막대 길이는 로그 눈금</p>
      </div>
      <div className="kpis">
        <Stat label="총 광고비" value={money(o.spend, "-")}>
          <span className="delta flat">{o.spendNote}</span>
        </Stat>
        <Stat label="실사용자 1명당 광고비" value={money(o.costPerUser, "-")} />
        <Stat label="결제 1건당 광고비" value={o.costPerOrder !== null ? money(o.costPerOrder, "-") : o.steps[3].value === 0 ? "결제 0건" : "-"} />
      </div>
      {o.verdict && (
        <div className={`verdict ${o.verdict.level}`}>
          <p className="verdict-head">{o.verdict.headline}</p>
          <p>{o.verdict.detail}</p>
          <p className="verdict-action">
            <strong>다음 할 일</strong> {o.verdict.action}
          </p>
        </div>
      )}
      <ol className="funnel" aria-label="광고 노출에서 실제 결제까지 퍼널">
        {o.steps.map((s) => (
          <li key={s.key}>
            {s.rateFromPrev !== null && (
              <span className="funnel-rate">
                ↓ {s.meaning?.rateName ?? "전환"} <b>{pct(s.rateFromPrev)}</b>
                {s.meaning && <span className={`meaning ${s.meaning.level}`}> · {s.meaning.text}</span>}
              </span>
            )}
            {s.rateFromPrev === null && s.meaning && (
              <span className="funnel-rate">
                <span className={`meaning ${s.meaning.level}`}>{s.meaning.text}</span>
              </span>
            )}
            <div className="funnel-row" title={`${s.label}: ${s.value === null ? "연결 안 됨" : n(s.value)} — ${s.note}`}>
              <span className="funnel-label">
                {s.label}
                <span className="fine">{s.note}</span>
              </span>
              <span className={s.value === null ? "funnel-track missing" : "funnel-track"}>
                {s.value !== null && s.value > 0 && <span className="funnel-bar" style={{ width: `${logWidth(s.value, max)}%` }} />}
              </span>
              <span className={s.value === 0 && s.key === "orders" ? "funnel-value zero" : "funnel-value"}>
                {s.value === null ? "연결 안 됨" : s.value === 0 && s.key === "orders" ? "⚠ 0건" : n(s.value)}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const LEVEL_TEXT = { bad: "긴급", warn: "확인", info: "참고", good: "양호" } as const;

export function ActionsPanel({ items }: { items: ActionItem[] }) {
  return (
    <section className="panel actions">
      <div className="panel-head">
        <h2>운영 체크</h2>
        <p className="meta">모든 소스에서 지금 손볼 것 · 심각한 순</p>
      </div>
      <ul className="action-list">
        {items.map((a, i) => (
          <li key={i} className={a.level}>
            <span className={`badge-level ${a.level}`}>{LEVEL_TEXT[a.level]}</span>
            <div>
              <p className="action-title">
                <span className="action-area">{a.area}</span> {a.title}
              </p>
              <p className="action-do">{a.action}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
