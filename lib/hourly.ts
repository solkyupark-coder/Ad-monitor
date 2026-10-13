// 1일 보기(어제·오늘)용 시간별 데이터 타입과 작은 도구(순수 함수). 시간대는 각 소스의 설정(광고 계정·GA4 속성) 기준이다.
export type AdHour = { date: string; hour: number; spend: number; clicks: number; impressions: number };
export type CountHour = { date: string; hour: number; value: number };

// "14:00:00 - 14:59:59" (Meta 시간별 구간) → 14. 못 읽으면 null.
export const metaHourOf = (label: string | undefined): number | null => {
  const m = /^(\d{1,2}):/.exec(label ?? "");
  const h = m ? Number(m[1]) : NaN;
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
};

// "2026100614" (GA4 dateHour) → { date: "2026-10-06", hour: 14 }
export const gaDateHour = (v: string | undefined): { date: string; hour: number } | null => {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(v ?? "");
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, hour: Number(m[4]) } : null;
};

// 시각 문자열(UTC 표기면 날짜 경계 시간대로 옮김) → { date, hour }
export const localDateHour = (v: string, offsetMs: number): { date: string; hour: number } | null => {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(v);
  const t = Date.parse(hasZone ? v : `${v.length === 10 ? `${v}T00:00:00` : v.replace(" ", "T")}Z`);
  if (Number.isNaN(t)) return null;
  const d = new Date(hasZone ? t + offsetMs : t);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
};

// 시간별 행들에서 그 날짜·시의 값을 뺀다(다른 브랜드로 옮긴 캠페인 등). 0 아래로는 내리지 않는다.
export function subtractHours(rows: AdHour[], moved: AdHour[][]): AdHour[] {
  const sub = new Map<string, AdHour>();
  for (const m of moved) for (const r of m) {
    const k = `${r.date}|${r.hour}`;
    const c = sub.get(k) ?? { date: r.date, hour: r.hour, spend: 0, clicks: 0, impressions: 0 };
    c.spend += r.spend; c.clicks += r.clicks; c.impressions += r.impressions;
    sub.set(k, c);
  }
  return rows.map((r) => {
    const s = sub.get(`${r.date}|${r.hour}`);
    return s ? { ...r, spend: Math.max(0, r.spend - s.spend), clicks: Math.max(0, r.clicks - s.clicks), impressions: Math.max(0, r.impressions - s.impressions) } : r;
  });
}

// 같은 날짜·시의 값끼리 더한다.
export function addHours(rows: AdHour[], extra: AdHour[][]): AdHour[] {
  const by = new Map(rows.map((r) => [`${r.date}|${r.hour}`, { ...r }]));
  for (const m of extra) for (const r of m) {
    const k = `${r.date}|${r.hour}`;
    const c = by.get(k) ?? { date: r.date, hour: r.hour, spend: 0, clicks: 0, impressions: 0 };
    c.spend += r.spend; c.clicks += r.clicks; c.impressions += r.impressions;
    by.set(k, c);
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
}
