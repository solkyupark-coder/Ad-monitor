"use client";
// 캠페인별 판정 목록 + 판정 필터. 값은 서버에서 계산해 넘어오고, 여기서는 거르기만 한다.
import { useState } from "react";
import { fmtValue } from "@/lib/format";
import { VERDICT_LABEL, type EffectRow, type Verdict } from "@/lib/effect";
import { LevelIcon } from "@/components/icons";
import { StateBadge } from "@/components/StateBadge";
import { isStopped } from "@/lib/campaign-state";

const pct = (r: number | null) => (r === null ? "-" : `${(r * 100).toFixed(1)}%`);
const FILTERS: (Verdict | "all")[] = ["all", "good", "warn", "bad", "hold"];

export function EffectList({ rows }: { rows: EffectRow[] }) {
  const [f, setF] = useState<Verdict | "all">("all");
  if (!rows.length) return <p className="note">광고 캠페인 데이터가 없습니다. 메타·구글 광고 연결과 선택한 기간을 확인하세요.</p>;
  const shown = rows.filter((r) => f === "all" || r.verdict === f).sort((a, b) => b.spend - a.spend);
  const count = (k: Verdict | "all") => (k === "all" ? rows.length : rows.filter((r) => r.verdict === k).length);
  const money = (v: number | null, cur: string) => (v === null ? "-" : fmtValue(v, "won", cur));
  return (
    <div className="fx-list">
      <div className="chips" role="group" aria-label="판정 필터">
        {FILTERS.map((k) => (
          <button key={k} type="button" className={f === k ? "chip on" : "chip"} aria-pressed={f === k} onClick={() => setF(k)}>
            {k === "all" ? "전체" : VERDICT_LABEL[k]} {count(k)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="note">이 판정에 해당하는 캠페인이 없습니다.</p>
      ) : (
        <ul className="fx-rows">
          {shown.map((r) => (
            <li key={`${r.channel}-${r.name}`} className={isStopped(r.state) ? "fx-row off" : "fx-row"}>
              <div className="fx-top">
                <span className="fx-name" title={r.name}>
                  <span className={`swatch ${r.channel === "meta" ? "c1" : "c2"}`} aria-hidden="true" />
                  <span className="fx-name-t nm">{r.name}</span>
                  <span className="fine-inline">{r.channel === "meta" ? "메타" : "구글"}</span>
                </span>
                <span className="tags">
                  <StateBadge state={r.state} />
                  <span className={`vchip ${r.verdict}`}>
                    <LevelIcon level={r.verdict} size={11} />
                    {VERDICT_LABEL[r.verdict]}
                  </span>
                </span>
              </div>
              <div className="fx-metrics">
                <span><i>광고비</i>{money(r.spend, r.currency)}</span>
                <span><i>클릭률</i>{pct(r.ctr)}</span>
                <span><i>GA 세션 · 참여</i>{r.sessions} · {r.engaged}</span>
                <span><i>참여율</i>{pct(r.engagementRate)}</span>
                <span><i>참여 1회당</i>{money(r.costPerEngaged, r.currency)}</span>
              </div>
              {r.channel === "meta" && !r.residual && r.clicks > 0 && (
                <p className="fx-flow" title="링크 클릭(메타) → 랜딩 페이지 조회(메타) → GA4 세션. 단계마다 줄어드는 만큼 사람이 빠져나간 곳입니다.">
                  <span><i>링크 클릭</i>{r.linkClicks ?? r.clicks}</span>
                  <b aria-hidden="true">→</b>
                  <span><i>랜딩 조회</i>{r.landingViews !== undefined ? `${r.landingViews}${r.landingViewRate != null ? ` (${pct(r.landingViewRate)})` : ""}` : "메타가 안 줌"}</span>
                  <b aria-hidden="true">→</b>
                  <span><i>GA 세션</i>{r.sessions}{r.landingViews ? ` (${pct(r.sessions / r.landingViews)})` : ""}</span>
                  <em>클릭 대비 도착 {pct(r.arriveRate ?? null)}</em>
                </p>
              )}
              {r.paidBy && <p className="fine">{r.paidBy}</p>}
              <p className="fx-why">{r.why}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
