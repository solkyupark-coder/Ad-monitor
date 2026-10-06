import { fmtValue } from "@/lib/format";
import { logWidth, type Overview } from "@/lib/overview";
import { Delta, Stat } from "@/components/ui";
import { ComboChart } from "@/components/ComboChart";
import type { ComboData } from "@/lib/combo";
import { LevelIcon, type Level } from "@/components/icons";
import type { DateRange } from "@/lib/range";
import type { ActionItem } from "@/lib/actions";

const n = (v: number) => fmtValue(v, "count");
const pct = (r: number) => (r === 0 ? "0%" : r >= 0.1 ? `${(r * 100).toFixed(0)}%` : r >= 0.001 ? `${(r * 100).toFixed(1)}%` : `${(r * 100).toFixed(2)}%`);
const LEVEL_WORD: Record<string, string> = { bad: "긴급", warn: "확인", info: "참고", good: "양호" };
// 채널 색은 채널(엔티티)에 고정: 메타=s1, 구글 광고=s2.
const channelClass = (name: string) => (name === "메타" ? "c1" : "c2");

export function OverviewPanel({ o, range, costPerEngaged, combo, brandLabel }: { o: Overview; range: DateRange; costPerEngaged: number | null; combo: ComboData | null; brandLabel: string }) {
  const max = Math.max(...o.steps.map((s) => s.value ?? 0), 1);
  const money = (v: number | null, empty: string) => (v === null ? empty : fmtValue(v, "won", o.currency));
  const widths = o.steps.map((s) => (s.value && s.value > 0 ? logWidth(s.value, max) : 0));
  const spendTotal = o.channels.reduce((a, c) => a + c.spend, 0);
  return (
    <section className="panel overview" aria-labelledby="ov-h">
      <div className="panel-head">
        <h2 id="ov-h">한눈에 보기</h2>
        <p className="meta">{range.label}</p>
      </div>

      {o.verdict && (
        <div className={`verdict ${o.verdict.level}`}>
          <p className="verdict-head">
            <span className={`pill ${o.verdict.level}`}>
              <LevelIcon level={o.verdict.level} />
              {o.verdict.level === "bad" ? "긴급" : o.verdict.level === "warn" ? "확인" : o.verdict.level === "good" ? "양호" : "참고"}
            </span>
            {o.verdict.headline}
          </p>
          <p>{o.verdict.detail}</p>
          <p className="verdict-action">
            <strong>다음 할 일</strong> {o.verdict.action}
          </p>
        </div>
      )}

      <div className="ov-grid">
        <div className="ov-spend">
          <p className="stat-label">광고비</p>
          <p className="hero-num">{money(o.spend, "-")}</p>
          {o.spend !== null && <Delta cur={o.spend} prev={o.spendPrev} goodWhen="neutral" />}
          {o.spend === null && <span className="delta flat">{o.spendNote}</span>}
          {o.spend !== null && o.fxNote && <p className="fine">{o.fxNote}</p>}
          {o.spend !== null && spendTotal > 0 && o.channels.length > 0 && (
            <>
              <div className="share" role="img" aria-label={`채널별 광고비: ${o.channels.map((c) => `${c.name} ${Math.round((c.spend / spendTotal) * 100)}%`).join(", ")}`}>
                {o.channels.map((c) => (
                  <span key={c.name} className={`share-seg ${channelClass(c.name)}`} style={{ flexGrow: Math.max(c.spend, 0.0001) }} />
                ))}
              </div>
              <ul className="share-legend">
                {o.channels.map((c) => (
                  <li key={c.name}>
                    <span className={`swatch ${channelClass(c.name)}`} aria-hidden="true" />
                    {c.name} {money(c.spend, "-")} · {Math.round((c.spend / spendTotal) * 100)}%
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="kpis kpis-3">
          <Stat label="실사용자 1명당" value={money(o.costPerUser, "-")}>
            <span className="delta flat">봇 제외 사용자</span>
          </Stat>
          <Stat label="참여 1회당" value={money(costPerEngaged, "-")}>
            <span className="delta flat">GA4 참여 세션 · 추적된 채널</span>
          </Stat>
          <Stat label="결제 1건당" value={o.costPerOrder !== null ? money(o.costPerOrder, "-") : o.steps[3].value === 0 ? "결제 0건" : "-"}>
            <span className="delta flat">최소치 · 광고 외 결제 포함</span>
          </Stat>
        </div>
      </div>

      {combo && (
        <div className="combo-wrap">
          <h3>{brandLabel} {combo.granularity === "hour" ? "시간별" : "일별"} 추이 <span className="fine-inline">광고비·사용자·클릭·결제를 한 그래프에</span></h3>
          <ComboChart combo={combo} title={`${brandLabel} ${combo.granularity === "hour" ? "시간별" : "일별"} 추이`} />
        </div>
      )}

      <div className="ov-body">
      <div className="fn-wrap">
        <h3>광고에서 결제까지 <span className="fine-inline">막대 길이는 로그 눈금</span></h3>
        <ol className="fn" aria-label="광고 노출에서 실제 결제까지 퍼널">
          {o.steps.map((s, i) => {
            const w = widths[i];
            const prevW = widths[i - 1];
            const lvl = (s.meaning?.level ?? "info") as Level;
            return (
              <li key={s.key}>
                {i > 0 && (
                  <>
                    <div className="fn-conn" aria-hidden="true">
                      <span
                        className="fn-trap"
                        style={{ clipPath: `polygon(${(100 - prevW) / 2}% 0, ${100 - (100 - prevW) / 2}% 0, ${100 - (100 - w) / 2}% 100%, ${(100 - w) / 2}% 100%)` }}
                      />
                    </div>
                    {(s.rateFromPrev !== null || s.meaning) && (
                      <p className={`fn-note ${s.meaning?.level ?? "info"}`}>
                        <LevelIcon level={lvl} />
                        <span>
                          {s.rateFromPrev !== null && (
                            <>
                              <b>{s.meaning?.rateName ?? "전환"} {pct(s.rateFromPrev)}</b>
                              {s.meaning && " · "}
                            </>
                          )}
                          {s.meaning?.text}
                        </span>
                      </p>
                    )}
                  </>
                )}
                <div className="fn-row" title={`${s.label}: ${s.value === null ? "연결 안 됨" : n(s.value)} — ${s.note}`}>
                  <span className="fn-label">
                    {s.label}
                    <span className="fine">{s.note}</span>
                  </span>
                  <span className={s.value === null ? "fn-track missing" : "fn-track"}>
                    {s.value !== null && s.value > 0 && <span className={`fn-bar f${i + 1}`} style={{ width: `${w}%` }} />}
                    {s.value === 0 && s.key === "orders" && <span className="fn-none">결제 완료 없음</span>}
                  </span>
                  <span className={s.value === 0 && s.key === "orders" ? "fn-value zero" : "fn-value"}>
                    {s.value === null ? "연결 안 됨" : s.value === 0 && s.key === "orders" ? "0건" : n(s.value)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      </div>
    </section>
  );
}

export function ActionsPanel({ items }: { items: ActionItem[] }) {
  return (
    <section className="panel actions" aria-labelledby="ac-h">
      <div className="panel-head">
        <h2 id="ac-h">운영 체크</h2>
        <p className="meta">모든 소스에서 지금 손볼 것 · 심각한 순</p>
      </div>
      <ul className="action-list">
        {items.map((a, i) => (
          <li key={i} className={a.level}>
            <span className={`badge-level ${a.level}`}>
              <LevelIcon level={a.level === "good" ? "good" : a.level === "bad" ? "bad" : a.level === "warn" ? "warn" : "info"} size={11} />
              {LEVEL_WORD[a.level]}
            </span>
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
