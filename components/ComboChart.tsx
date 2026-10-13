"use client";
// 일별 추이 한 장에 겹쳐 그리기: 광고비(막대, 왼쪽 축) + 실사용자·클릭(선, 오른쪽 축) + 결제·가입(마커 줄), 직전 기간은 흐린 점선.
// 범례를 눌러 지표를 켜고 끄고, 마우스(또는 터치·←→ 키)로 그날 수치를 본다. 광고를 켜고 끈 날짜는 세로선 + 라벨.
// 두 축을 쓰는 만큼 오해를 줄이려고: 축 제목에 어느 지표의 축인지 적고, 막대는 왼쪽·선은 오른쪽으로만 쓰며, 정확한 값은 툴팁과 '표로 보기'에 둔다.
import { useEffect, useRef, useState } from "react";
import { fmtCompact, fmtDate, fmtValue } from "@/lib/format";
import type { ComboData, ComboDay } from "@/lib/combo";

type Key = "spend" | "users" | "clicks" | "orders" | "signups" | "prev";

const L = 48;
const R = 46;
const B = 26;
const LANE = 13; // 이벤트 라벨 한 줄 높이
const STRIP = 26; // 결제 마커 줄 높이

const niceMax = (v: number): number => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};
const wd = (iso: string) => ["일", "월", "화", "수", "목", "금", "토"][new Date(`${iso}T00:00:00Z`).getUTCDay()];
// 라벨 폭 추정(한글은 넓게).
const textW = (s: string) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 10.5 : 6), 8);

export function ComboChart({ combo, title }: { combo: ComboData; title: string }) {
  const { days, prev, events, currency } = combo;
  const hourly = combo.granularity === "hour";
  const when = (d: ComboDay) => (hourly ? `${fmtDate(d.date)} ${d.h}시` : `${fmtDate(d.date)} (${wd(d.date)})`);
  const tick = (d: ComboDay) => (hourly ? `${d.h}시` : fmtDate(d.date));
  const usersName = combo.usersLabel;
  const has: Record<Exclude<Key, "prev">, boolean> = {
    spend: currency !== null && days.some((d) => d.spend !== null),
    users: days.some((d) => d.users !== null),
    clicks: days.some((d) => d.clicks !== null),
    orders: days.some((d) => d.orders !== null),
    signups: days.some((d) => d.signups !== null),
  };
  const [on, setOn] = useState<Record<Key, boolean>>({ spend: true, users: true, clicks: true, orders: true, signups: true, prev: true });
  const [hover, setHover] = useState<number | null>(null);
  const [w, setW] = useState(480);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const cw = Math.round(e.contentRect.width);
      if (cw >= 200) setW(Math.min(Math.max(cw, 260), 900));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = days.length;
  if (!n || !Object.values(has).some(Boolean)) return <p className="note">그래프를 그릴 일별 데이터가 없습니다. 광고·GA4·결제 소스 연결을 확인하세요.</p>;
  const show = (k: Exclude<Key, "prev">) => has[k] && on[k];
  const showPrev = on.prev && prev.length === n;
  const compact = w < 420;

  // 이벤트: 기간 안의 것만 세로선(기간 밖은 아래 글줄로).
  const index = new Map(days.map((d, i) => [d.date, i]));
  const inRange = events.filter((e) => index.has(e.date));
  const outRange = events.filter((e) => !index.has(e.date));
  const band = (w - L - R) / n;
  const cx = (i: number) => L + band * (i + 0.5);
  const lanes: { e: (typeof inRange)[number]; x: number; lane: number; anchor: "start" | "end"; wpx: number }[] = [];
  const laneEnd: number[] = [];
  for (const e of inRange) {
    const x = cx(index.get(e.date)!);
    const wpx = textW(e.label);
    const anchor: "start" | "end" = x + wpx > w - R + 6 ? "end" : "start";
    const [a, b] = anchor === "start" ? [x, x + wpx] : [x - wpx, x];
    let lane = laneEnd.findIndex((end) => end < a - 3);
    if (lane < 0) lane = laneEnd.length < 3 ? laneEnd.length : 2;
    laneEnd[lane] = b;
    lanes.push({ e, x, lane, anchor, wpx });
  }
  const laneCount = lanes.length ? Math.max(...lanes.map((l) => l.lane)) + 1 : 0;
  // 결제(◆)·가입(●)은 각자 한 줄의 마커 줄로 그래프 위에 둔다.
  const strips = (["orders", "signups"] as const).filter(show);
  const T = 12 + laneCount * LANE + strips.length * STRIP;
  const H = compact ? 270 : 310;
  const yb = H - B; // 기준선
  const ph = yb - T - 4;

  const vals = (k: "spend" | "users" | "clicks", src: ComboDay[]) => src.map((d) => d[k] ?? 0);
  const leftVals = show("spend") ? [...vals("spend", days), ...(showPrev ? vals("spend", prev) : [])] : [0];
  const rightKeys = (["users", "clicks"] as const).filter(show);
  const rightVals = rightKeys.flatMap((k) => [...vals(k, days), ...(showPrev ? vals(k, prev) : [])]);
  const lmax = niceMax(Math.max(...leftVals, 0));
  const rmax = niceMax(Math.max(...rightVals, 0));
  const yl = (v: number) => T + ph * (1 - v / lmax);
  const yr = (v: number) => T + ph * (1 - v / rmax);
  // 시간별 오늘 보기는 지금 이후 칸이 비어 있다(null): 선을 거기서 끊는다. 일별 보기에서는 값이 없으면 0으로 그린다.
  const path = (src: ComboDay[], k: "spend" | "users" | "clicks", y: (v: number) => number) => {
    let d = "";
    let pen = false;
    src.forEach((p, i) => {
      const v = p[k];
      if (hourly && v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${cx(i).toFixed(1)},${y(v ?? 0).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const bw = Math.min(24, Math.max(2, band - 2));
  const barPath = (i: number, v: number) => {
    const x = cx(i) - bw / 2;
    const y = yl(v);
    const r = Math.min(4, bw / 2, yb - y);
    return r <= 0.5 ? `M${x},${yb}h${bw}v-0.5h-${bw}z` : `M${x},${yb}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + bw - r},${y}Q${x + bw},${y} ${x + bw},${y + r}L${x + bw},${yb}Z`;
  };

  const active = hover ?? (hourly ? Math.min(n - 1, combo.nowHour ?? 23) : n - 1);
  const locate = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * w;
    setHover(Math.max(0, Math.min(n - 1, Math.floor((sx - L) / band))));
  };
  const money = (v: number | null) => (v === null ? "-" : fmtValue(v, "won", currency ?? "KRW"));
  const cnt = (v: number | null) => (v === null ? "-" : fmtValue(v, "count"));
  const d = days[active];
  const pd = showPrev ? prev[active] : null;
  const dayEvents = events.filter((e) => e.date === d.date);
  const tipRight = cx(active) < w / 2;
  const rows: { k: string; label: string; v: string; pv: string | null; kind: "bar" | "line1" | "line2" | "mark" | "mark2" }[] = [];
  if (show("spend")) rows.push({ k: "spend", label: "광고비", v: money(d.spend), pv: pd ? money(pd.spend) : null, kind: "bar" });
  if (show("users")) rows.push({ k: "users", label: usersName, v: `${cnt(d.users)}명`, pv: pd ? `${cnt(pd.users)}명` : null, kind: "line1" });
  if (show("clicks")) rows.push({ k: "clicks", label: "광고 클릭", v: `${cnt(d.clicks)}번`, pv: pd ? `${cnt(pd.clicks)}번` : null, kind: "line2" });
  if (show("orders")) rows.push({ k: "orders", label: "결제", v: `${cnt(d.orders)}건`, pv: pd ? `${cnt(pd.orders)}건` : null, kind: "mark" });
  if (show("signups")) rows.push({ k: "signups", label: "가입", v: `${cnt(d.signups)}명`, pv: pd ? `${cnt(pd.signups)}명` : null, kind: "mark2" });

  const legend: { k: Key; label: string; kind: "bar" | "line1" | "line2" | "mark" | "mark2" | "dash"; off?: string }[] = [
    { k: "spend", label: `광고비${currency ? ` (${currency === "KRW" ? "원" : currency})` : ""}`, kind: "bar", off: has.spend ? undefined : combo.notes[0] ?? "광고 소스가 연결되지 않았습니다" },
    { k: "users", label: usersName, kind: "line1", off: has.users ? undefined : "GA4가 연결되지 않았거나 일별 값을 읽지 못했습니다" },
    { k: "clicks", label: "광고 클릭", kind: "line2", off: has.clicks ? undefined : "광고 소스가 연결되지 않았습니다" },
    { k: "orders", label: "결제", kind: "mark", off: has.orders ? undefined : "결제(Polar·Supabase)가 연결되지 않았습니다" },
    { k: "signups", label: "가입", kind: "mark2", off: has.signups ? undefined : "가입 집계(Supabase 함수)가 연결되지 않았거나 시간별 값은 제공되지 않습니다 — 1일 보기는 하루 합계만 표시" },
    { k: "prev", label: hourly ? "전날" : "직전 기간", kind: "dash", off: prev.length === n ? undefined : "비교할 이전 기간 데이터가 없습니다" },
  ];
  const KeyIcon = ({ kind }: { kind: string }) => (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" className="ckey">
      {kind === "bar" && <rect x="5" y="1" width="12" height="10" rx="2" fill="var(--s1)" />}
      {kind === "line1" && <line x1="1" x2="21" y1="6" y2="6" stroke="var(--s2)" strokeWidth="2.5" strokeLinecap="round" />}
      {kind === "line2" && <line x1="1" x2="21" y1="6" y2="6" stroke="var(--s3)" strokeWidth="2.5" strokeLinecap="round" />}
      {kind === "mark" && <path d="M11 1l5 5-5 5-5-5z" fill="var(--s4)" />}
      {kind === "mark2" && <circle cx="11" cy="6" r="4.5" fill="var(--s4)" />}
      {kind === "dash" && <line x1="1" x2="21" y1="6" y2="6" stroke="var(--ink2)" strokeWidth="1.5" strokeDasharray="4 3" opacity=".7" />}
    </svg>
  );

  return (
    <div className="combo">
      {combo.compare && (
        <div className="cmp" aria-label={combo.compare.title}>
          <p className="cmp-t">{combo.compare.title}</p>
          <ul>
            {combo.compare.rows.map((r) => {
              const f = (v: number) => (r.won ? fmtValue(v, "won", currency ?? "KRW") : fmtValue(v, "count"));
              const diff = r.prev > 0 ? (r.cur - r.prev) / r.prev : null;
              return (
                <li key={r.key}>
                  <i>{r.label}</i>
                  <b>{f(r.cur)}</b>
                  <span>{r.prev > 0 ? `${diff! > 0 ? "+" : ""}${Math.round(diff! * 100)}% · 전날 ${f(r.prev)}` : r.cur > 0 ? `전날 0` : "전날도 0"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="combo-legend" role="group" aria-label={`${title} 지표 켜고 끄기`}>
        {legend.map((l) => (
          <button
            key={l.k}
            type="button"
            className={l.off ? "clg dis" : on[l.k] ? "clg" : "clg off"}
            aria-pressed={l.off ? false : on[l.k]}
            disabled={!!l.off}
            title={l.off ?? (on[l.k] ? "누르면 숨깁니다" : "누르면 보입니다")}
            onClick={() => setOn((o) => ({ ...o, [l.k]: !o[l.k] }))}
          >
            <KeyIcon kind={l.kind} />
            {l.label}
          </button>
        ))}
      </div>
      <div className="axis-keys" aria-hidden="true">
        <span>{show("spend") ? "◀ 왼쪽 축: 광고비 막대" : ""}</span>
        <span>{rightKeys.length ? `오른쪽 축: ${rightKeys.map((k) => (k === "users" ? usersName : "클릭")).join("·")} 선 ▶` : ""}</span>
      </div>
      <div className="chart combo-chart" ref={box}>
        <div className="ctip" style={{ left: `${(cx(active) / w) * 100}%`, transform: tipRight ? "translateX(12px)" : "translateX(calc(-100% - 12px))", opacity: hover === null ? 0 : 1 }} aria-hidden>
          <strong>{when(d)}</strong>
          {rows.map((r) => (
            <span key={r.k} className="crow">
              <KeyIcon kind={r.kind} />
              <b>{r.v}</b>
              <i>{r.label}</i>
              {r.pv !== null && <em>직전 {when(prev[active])} {r.pv}</em>}
            </span>
          ))}
          {dayEvents.map((e) => (
            <span key={e.label} className="cev">▏{e.full}</span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${w} ${H}`}
          role="img"
          aria-label={hourly ? `${title}: 시간별 광고비·사용자·클릭·결제·가입 추이` : `${title}: 최근 ${n}일 광고비·실사용자·클릭·결제·가입 일별 추이`}
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
          {/* 격자와 두 축 눈금 */}
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={L} x2={w - R} y1={yl(lmax * t)} y2={yl(lmax * t)} stroke="var(--grid)" strokeWidth="1" />
              {show("spend") && <text x={L - 7} y={yl(lmax * t) + 4} textAnchor="end" className="axis">{fmtCompact(lmax * t)}</text>}
              {rightKeys.length > 0 && <text x={w - R + 7} y={yr(rmax * t) + 4} textAnchor="start" className="axis">{fmtCompact(rmax * t)}</text>}
            </g>
          ))}
          <line x1={L} x2={w - R} y1={yb} y2={yb} stroke="var(--axis)" strokeWidth="1" />
          {(hourly ? [0, 6, 12, 18, 23] : [0, Math.floor((n - 1) / 2), n - 1]).filter((v, i, a) => a.indexOf(v) === i && v < n).map((i) => (
            <text key={i} x={cx(i)} y={H - 7} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="axis">{tick(days[i])}</text>
          ))}

          {/* 막대: 광고비 */}
          {show("spend") && days.map((dd, i) => (dd.spend ?? 0) > 0 && <path key={dd.date} d={barPath(i, dd.spend ?? 0)} fill="var(--s1)" opacity={hover === null || hover === i ? 1 : 0.8} />)}
          {/* 직전 기간: 같은 색의 흐린 점선(막대는 점선으로) */}
          {showPrev && show("spend") && <path d={path(prev, "spend", yl)} fill="none" stroke="var(--s1)" strokeWidth="1.5" strokeDasharray="4 3" opacity=".5" strokeLinejoin="round" />}
          {showPrev && show("users") && <path d={path(prev, "users", yr)} fill="none" stroke="var(--s2)" strokeWidth="1.5" strokeDasharray="4 3" opacity=".5" strokeLinejoin="round" />}
          {showPrev && show("clicks") && <path d={path(prev, "clicks", yr)} fill="none" stroke="var(--s3)" strokeWidth="1.5" strokeDasharray="4 3" opacity=".5" strokeLinejoin="round" />}
          {/* 선: 실사용자·클릭(오른쪽 축) */}
          {show("users") && <path d={path(days, "users", yr)} fill="none" stroke="var(--s2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {show("clicks") && <path d={path(days, "clicks", yr)} fill="none" stroke="var(--s3)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}

          {/* 결제(◆)·가입(●) 마커 줄 */}
          {strips.map((k, j) => {
            const top = T - (strips.length - j) * STRIP; // 이 줄의 위쪽
            const cy = top + 8;
            return (
              <g key={k}>
                {days.map((dd, i) => (dd[k] ?? 0) > 0 && (
                  <g key={dd.date + (dd.h ?? "")}>
                    {k === "orders" ? <path d={`M${cx(i)},${cy - 6}l6,6-6,6-6-6z`} fill="var(--s4)" stroke="var(--surface)" strokeWidth="2" paintOrder="stroke" /> : <circle cx={cx(i)} cy={cy} r="6" fill="var(--s4)" stroke="var(--surface)" strokeWidth="2" paintOrder="stroke" />}
                    {(dd[k] ?? 0) > 1 && <text x={cx(i)} y={cy + 3.5} textAnchor="middle" className="mark-n">{dd[k]}</text>}
                  </g>
                ))}
                {showPrev && prev.map((pp, i) => (pp[k] ?? 0) > 0 && <circle key={pp.date + (pp.h ?? "")} cx={cx(i)} cy={top + STRIP - 5} r="3.2" fill="none" stroke="var(--s4)" strokeWidth="1.5" opacity=".55" />)}
              </g>
            );
          })}

          {/* 광고를 켜고 끈 날짜: 세로선 + 라벨 */}
          {lanes.map(({ e, x, lane, anchor }) => (
            <g key={`${e.date}-${e.label}`} className="ev">
              <title>{`${e.full}${e.inferred ? " (일별 지출로 추정한 날짜)" : ""}`}</title>
              <line x1={x} x2={x} y1={12 + lane * LANE + 3} y2={yb} stroke="var(--ink2)" strokeWidth="1" strokeDasharray={e.inferred ? "2 3" : undefined} opacity=".8" />
              <text x={anchor === "start" ? x + 3 : x - 3} y={12 + lane * LANE + 9} textAnchor={anchor} className="ev-t">{e.kind === "start" ? "▶ " : e.kind === "stop" ? "■ " : "● "}{e.label}</text>
            </g>
          ))}

          {/* 오늘 보기: 지금 시각 표시 */}
          {hourly && combo.nowHour !== null && (
            <g>
              <line x1={cx(combo.nowHour) + band / 2} x2={cx(combo.nowHour) + band / 2} y1={T} y2={yb} stroke="var(--ink2)" strokeWidth="1" strokeDasharray="1 3" opacity=".7" />
              <text x={cx(combo.nowHour) + band / 2 + 3} y={yb - 4} className="ev-t">지금</text>
            </g>
          )}

          {/* 십자선과 지금 값 점 */}
          {hover !== null && <line x1={cx(active)} x2={cx(active)} y1={T} y2={yb} stroke="var(--axis)" strokeWidth="1" />}
          {show("users") && d.users !== null && <><circle cx={cx(active)} cy={yr(d.users ?? 0)} r="6" fill="var(--surface)" /><circle cx={cx(active)} cy={yr(d.users ?? 0)} r="4" fill="var(--s2)" /></>}
          {show("clicks") && d.clicks !== null && <><circle cx={cx(active)} cy={yr(d.clicks ?? 0)} r="6" fill="var(--surface)" /><circle cx={cx(active)} cy={yr(d.clicks ?? 0)} r="4" fill="var(--s3)" /></>}
        </svg>
      </div>
      {outRange.length > 0 && (
        <p className="fine">
          기간 밖 표시: {outRange.map((e) => `${fmtDate(e.date)} ${e.full}`).join(" · ")}
        </p>
      )}
      {inRange.some((e) => e.inferred) && <p className="fine">점선 세로선은 일별 지출이 끊기거나 시작된 날로 추정한 날짜입니다(정확한 날짜는 env <code>AD_EVENT_MARKERS</code>로 찍을 수 있어요).</p>}
      {combo.notes.map((t) => (
        <p key={t} className="fine">{t}</p>
      ))}
      <details className="tableview">
        <summary>표로 보기</summary>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{hourly ? "시각" : "날짜"}</th>
                {has.spend && <th>광고비</th>}
                {has.users && <th>실사용자</th>}
                {has.clicks && <th>클릭</th>}
                {has.orders && <th>결제</th>}
                {has.signups && <th>가입</th>}
                {prev.length === n && <th>직전 기간(광고비 · 사용자 · 클릭 · 결제 · 가입)</th>}
              </tr>
            </thead>
            <tbody>
              {days.map((dd, i) => (
                <tr key={dd.date}>
                  <td>{hourly ? `${dd.date} ${dd.h}시` : dd.date}</td>
                  {has.spend && <td>{money(dd.spend)}</td>}
                  {has.users && <td>{cnt(dd.users)}</td>}
                  {has.clicks && <td>{cnt(dd.clicks)}</td>}
                  {has.orders && <td>{cnt(dd.orders)}</td>}
                  {has.signups && <td>{cnt(dd.signups)}</td>}
                  {prev.length === n && <td>{hourly ? `${prev[i].h}시` : fmtDate(prev[i].date)}: {[has.spend ? money(prev[i].spend) : null, has.users ? cnt(prev[i].users) : null, has.clicks ? cnt(prev[i].clicks) : null, has.orders ? cnt(prev[i].orders) : null, has.signups ? cnt(prev[i].signups) : null].filter((x) => x !== null).join(" · ")}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
