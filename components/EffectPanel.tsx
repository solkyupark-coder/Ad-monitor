import { fmtValue } from "@/lib/format";
import { BAD_COST_MULT, BAD_RATE, GOOD_RATE, HIGH_CTR, MIN_CLICKS, MIN_SESSIONS, VERDICT_LABEL, effectHeadline, spendByClass, type EffectReport, type EffectRow, type SpendClass } from "@/lib/effect";
import { LevelIcon } from "@/components/icons";
import { ExportSheet } from "@/components/ExportSheet";
import { EffectList } from "@/components/EffectList";
import type { ExportData } from "@/lib/export";
import type { DateRange } from "@/lib/range";

const pct = (r: number | null) => (r === null ? "-" : `${(r * 100).toFixed(1)}%`);
export const channelName = (c: EffectRow) => (c.channel === "meta" ? "메타" : "구글 광고");

export function VerdictChip({ v }: { v: EffectRow["verdict"] }) {
  return (
    <span className={`vchip ${v}`}>
      <LevelIcon level={v} size={11} />
      {VERDICT_LABEL[v]}
    </span>
  );
}

const CLASS_ICON: Record<SpendClass, "bad" | "warn" | "good" | "hold"> = { bad: "bad", warn: "warn", good: "good", hold: "hold", unmeasured: "hold" };

export function EffectPanel({ e, range, data }: { e: EffectReport; range: DateRange; data: ExportData }) {
  const moneyC = (v: number | null, cur: string) => (v === null ? "-" : fmtValue(v, "won", cur));
  const money = (v: number | null) => moneyC(v, e.currency);
  const maxCpe = Math.max(...e.channels.map((c) => c.costPerEngaged ?? 0), 1);
  const sameCurrency = !e.mixedCurrency; // 통화가 다르면 막대로 견주지 않는다
  const head = effectHeadline(e);
  const where = spendByClass(e);
  return (
    <section className="panel effect" aria-labelledby="fx-h">
      <div className="panel-head">
        <div>
          <h2 id="fx-h">광고 효과 추출</h2>
          <p className="meta">{range.label} · 참여 = GA4 참여 세션(데이터센터 도시 제외)</p>
        </div>
        <div className="head-actions">
          <ExportSheet data={data} />
        </div>
      </div>

      {e.gaMissing && (
        <div className="alert warn" role="alert">
          <strong>GA4 캠페인 데이터를 읽지 못했습니다</strong>
          <p>광고비·클릭만 보이고 효과 판정은 모두 보류입니다. GA4 카드의 안내(토큰·권한)를 먼저 해결하세요.</p>
        </div>
      )}
      {e.notes.map((n) => (
        <p key={n} className="fine">{n}</p>
      ))}

      {head && (
        <div className={`verdict ${head.level}`}>
          <p className="verdict-head">
            <span className={`pill ${head.level}`}>
              <LevelIcon level={head.level} />
              {head.level === "bad" ? "긴급" : head.level === "warn" ? "확인" : "양호"}
            </span>
            {head.headline}
          </p>
          <p className="verdict-action">
            <strong>다음 할 일</strong> {head.action}
          </p>
        </div>
      )}

      {where.segments.length > 0 && (
        <div className="fx-where">
          <h3>광고비가 간 곳 <span className="fine-inline">캠페인 광고비 {money(where.total)} 기준</span></h3>
          <div className="where-bar" role="img" aria-label={`판정별 광고비: ${where.segments.map((g) => `${g.label} ${Math.round(g.share * 100)}%`).join(", ")}`}>
            {where.segments.map((g) => (
              <span key={g.key} className={`where-seg ${g.key}`} style={{ flexGrow: g.spend }} />
            ))}
          </div>
          <ul className="where-legend">
            {where.segments.map((g) => (
              <li key={g.key}>
                <span className={`where-key ${g.key}`}>
                  <LevelIcon level={CLASS_ICON[g.key]} size={11} />
                </span>
                {g.label} {money(g.spend)} · {Math.round(g.share * 100)}%
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="fx-hi">
        <div className="fx-card good">
          <span className="fx-card-k"><LevelIcon level="good" />가장 효과적</span>
          {e.best ? (
            <>
              <strong>{e.best.name}</strong>
              <span className="fine">{channelName(e.best)} · 참여 1회당 {moneyC(e.best.costPerEngaged, e.best.currency)}{e.baseline ? ` (평균 ${money(e.baseline)})` : ""}</span>
            </>
          ) : (
            <span className="fine">판정된 캠페인이 없습니다</span>
          )}
        </div>
        <div className="fx-card bad">
          <span className="fx-card-k"><LevelIcon level="bad" />가장 큰 낭비 의심</span>
          {e.worst ? (
            <>
              <strong>{e.worst.name}</strong>
              <span className="fine">{channelName(e.worst)} · {moneyC(e.worst.spend, e.worst.currency)} 쓰고 참여 {e.worst.engaged}회 (참여율 {pct(e.worst.engagementRate)})</span>
            </>
          ) : (
            <span className="fine">낭비 의심으로 판정된 캠페인이 없습니다</span>
          )}
        </div>
        <div className="fx-card hold">
          <span className="fx-card-k"><LevelIcon level="hold" />측정 안 됨</span>
          <strong>캠페인 {e.unmeasured}개</strong>
          <span className="fine">{e.unmeasured ? "클릭은 충분한데 GA4에 캠페인 이름이 안 잡힘 — 광고 링크에 utm_campaign 필요" : "모든 캠페인이 GA4와 연결됨"}</span>
        </div>
      </div>

      {e.channels.length > 0 && (
        <div className="fx-ch">
          <h3>채널별 참여 1회당 비용 <span className="fine-inline">낮을수록 좋음</span></h3>
          <ul className="fx-bars">
            {e.channels.map((c) => (
              <li key={c.channel}>
                <span className="fx-bar-name"><span className={`swatch ${c.channel === "meta" ? "c1" : "c2"}`} aria-hidden="true" />{c.name}</span>
                <span className="fx-bar-track">
                  {sameCurrency && c.costPerEngaged !== null && <span className={`fx-bar-fill ${c.channel === "meta" ? "c1" : "c2"}`} style={{ width: `${Math.max(3, (c.costPerEngaged / maxCpe) * 100)}%` }} />}
                </span>
                <span className="fx-bar-val">{c.costPerEngaged === null ? "참여 없음" : moneyC(c.costPerEngaged, c.currency)}</span>
                <span className="fx-bar-meta">
                  <VerdictChip v={c.verdict} />
                  <span>클릭률 {pct(c.ctr)} · 참여율 {pct(c.engagementRate)} · GA 세션 {c.sessions} · 참여 {c.engaged}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="fx-h3">캠페인별 판정</h3>
      <EffectList rows={e.campaigns} />

      <details className="criteria">
        <summary>판정 기준 보기</summary>
        <ul>
          <li><strong>보류</strong> 클릭 {MIN_CLICKS} 미만 또는 GA4 연결 세션 {MIN_SESSIONS} 미만 — 표본이 적어 판단하지 않음</li>
          <li><strong>낭비 의심</strong> 참여율 {BAD_RATE * 100}% 미만, 또는 참여 1회당 비용이 전체 평균의 {BAD_COST_MULT}배 이상</li>
          <li><strong>점검</strong> 참여율 {BAD_RATE * 100}~{GOOD_RATE * 100}% (클릭률 {HIGH_CTR * 100}% 초과면 지면·국가 확인 안내), 또는 참여는 좋은데 평균보다 비쌈</li>
          <li><strong>효과 있음</strong> 참여율 {GOOD_RATE * 100}% 이상이고 참여 1회당 비용이 평균 이하</li>
        </ul>
        <p className="fine">참여 세션 = 10초 이상 머물거나 2페이지 이상 본 세션(GA4 정의). 캠페인은 GA4 캠페인 이름과 광고 캠페인 이름이 같을 때만 연결(공백·기호 무시). 실제 결제(Polar·Supabase)는 어느 채널에서 왔는지 나눌 수 없어 판정에 쓰지 않습니다. 방문 대비 클릭 수(도착률)는 GA 누락(인앱 브라우저·차단)으로 낮게 잡힐 수 있어 '낭비 의심'의 단독 근거로 쓰지 않습니다.</p>
      </details>
    </section>
  );
}
