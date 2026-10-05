// 대시보드 조회 기간. URL ?range=7|14|28|90 또는 ?from=YYYY-MM-DD&to=YYYY-MM-DD. 기본은 어제까지 7일.
// 날짜 경계는 DASHBOARD_UTC_OFFSET_HOURS(기본 9, 한국) 기준이다.
const DAY = 86400000;
export const PRESETS = [7, 14, 28, 90] as const;
const MAX_DAYS = 366;

export type DateRange = {
  from: string; // YYYY-MM-DD (포함)
  to: string; // YYYY-MM-DD (포함)
  days: number;
  preset: number | null; // 프리셋이면 그 일수, 직접 지정이면 null
  label: string; // 화면 표시용
  prev: { from: string; to: string }; // 같은 길이의 직전 기간(비교용)
};

export function offsetMs(): number {
  const h = Number(process.env.DASHBOARD_UTC_OFFSET_HOURS ?? 9);
  return (Number.isFinite(h) ? h : 9) * 3600000;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parse = (s: string | undefined): number | null => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(t) || iso(t) !== s ? null : t;
};

// 오늘(날짜 경계 시간대 기준)의 YYYY-MM-DD를 UTC 자정 ms로.
function todayMs(now: number): number {
  return Math.floor((now + offsetMs()) / DAY) * DAY;
}

export function yesterdayDate(now = Date.now()): string {
  return iso(todayMs(now) - DAY);
}

function build(fromMs: number, toMs: number, preset: number | null): DateRange {
  const days = Math.round((toMs - fromMs) / DAY) + 1;
  const md = (ms: number) => `${Number(iso(ms).slice(5, 7))}/${Number(iso(ms).slice(8, 10))}`;
  return {
    from: iso(fromMs),
    to: iso(toMs),
    days,
    preset,
    label: preset ? `최근 ${preset}일 (${md(fromMs)}–${md(toMs)}, 어제까지)` : `${md(fromMs)}–${md(toMs)} (${days}일)`,
    prev: { from: iso(fromMs - days * DAY), to: iso(fromMs - DAY) },
  };
}

export function parseRange(q: { range?: string; from?: string; to?: string }, now = Date.now()): DateRange {
  const today = todayMs(now);
  const f = parse(q.from);
  const t = parse(q.to);
  if (f !== null && t !== null && f <= t && t <= today && (t - f) / DAY + 1 <= MAX_DAYS) return build(f, t, null);
  const n = Number(q.range);
  const preset = (PRESETS as readonly number[]).includes(n) ? n : 7;
  const to = today - DAY;
  return build(to - (preset - 1) * DAY, to, preset);
}

// 실제 결제 조회용: [from 0시, to 다음날 0시) 를 UTC 시각으로.
export function rangeInstants(r: { from: string; to: string }): { since: Date; until: Date } {
  const off = offsetMs();
  return { since: new Date(Date.parse(`${r.from}T00:00:00Z`) - off), until: new Date(Date.parse(`${r.to}T00:00:00Z`) + DAY - off) };
}

// [from, to] 사이의 모든 날짜(YYYY-MM-DD).
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end; t += DAY) out.push(iso(t));
  return out;
}

export function rangeQuery(r: DateRange): string {
  return r.preset ? `range=${r.preset}` : `from=${r.from}&to=${r.to}`;
}
